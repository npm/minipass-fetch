'use strict'
const t = require('tap')
const Body = require('../lib/body.js')
const { URLSearchParams } = require('url')
const stringToArrayBuffer = require('string-to-arraybuffer')
const URLSearchParamsPolyfill = require('@ungap/url-search-params')
const Blob = require('../lib/blob')
const FormData = require('form-data')
const { Minipass } = require('minipass')
const MinipassSized = require('minipass-sized')
const AbortError = require('../lib/abort-error.js')
const { PassThrough } = require('stream')

t.test('null body', async t => {
  const b = new Body()
  t.equal(b.body, null)
  t.equal(Body.extractContentType(b.body), null)
  t.equal(Body.getTotalBytes(b), 0)
  t.match(await b.buffer(), Buffer.alloc(0))
})

t.test('url search params', async t => {
  const b = new Body(new URLSearchParams('a=1'))
  t.equal(b.body.toString(), 'a=1')
  t.equal(Body.extractContentType(b.body), null)
  t.equal(Body.getTotalBytes(b), 3)
})

t.test('url search params polyfill', async t => {
  const b = new Body(new URLSearchParamsPolyfill('a=1'))
  t.equal(b.body.toString(), 'a=1')
  t.equal(Body.extractContentType(b.body), null)
  t.equal(Body.getTotalBytes(b), 3)
})

t.test('url search params by another name', async t => {
  const b = new Body(new (class Florb extends URLSearchParams {})('a=1'))
  t.equal(b.body.toString(), 'a=1')
  t.equal(Body.extractContentType(b.body), null)
  t.equal(Body.getTotalBytes(b), 3)
})

t.test('url search params by an even differenter name', async t => {
  const b = new Body(new (class Florb extends URLSearchParams {
    get [Symbol.toStringTag] () {
      return 'Florb'
    }
  })('a=1'))
  t.equal(b.body.toString(), 'a=1')
  t.equal(Body.extractContentType(b.body), null)
  t.equal(Body.getTotalBytes(b), 3)
})

t.test('form-data', async t => {
  const f = new FormData()
  f.append('a', '1')
  const b = new Body(f)
  t.match(b.body.getBuffer().toString(), `
Content-Disposition: form-data; name="a"\r
\r
1\r
`)
  t.equal(Body.extractContentType(b.body),
    'multipart/form-data;boundary=' + f.getBoundary())
  t.equal(Body.getTotalBytes(b), f.getBuffer().length)
})

t.test('blob body', async t => {
  const b = new Body(new Blob('a=1', { type: 'foo', size: 3 }))
  b.url = 'double'
  t.equal(Body.getTotalBytes(b), 3)
  t.equal(Body.extractContentType(b.body), 'foo')
  t.equal(b.bodyUsed, false)
  t.equal(await b.text(), 'a=1')
  t.equal(b.bodyUsed, true)
  await t.rejects(() => b.buffer(), TypeError)
})

t.test('blob body no content-type', async t => {
  const b = new Body(new Blob('a=1', { size: 3 }))
  b.headers = { get () {} }
  t.match(await b.blob(), {
    [Blob.BUFFER]: Buffer.from('a=1'),
    size: 3,
    type: '',
  })
})

t.test('blob body with content-type', async t => {
  const b = new Body(new Blob('a=1', { size: 3 }))
  b.headers = { get () {
    return 'glerb'
  } }
  t.match(await b.blob(), {
    [Blob.BUFFER]: Buffer.from('a=1'),
    size: 3,
    type: 'glerb',
  })
})

t.test('buffer body', async t => {
  const b = new Body(Buffer.from('a=1'))
  t.equal(b.body.toString(), 'a=1')
  t.equal(Body.extractContentType(b.body), null)
  t.equal(await b.arrayBuffer().then(buf => Buffer.from(buf).toString()), 'a=1')
})

t.test('array buffer body', async t => {
  const b = new Body(stringToArrayBuffer('a=1'))
  t.equal(b.body.toString(), 'a=1')
  t.equal(Body.extractContentType(b.body), null)
})

t.test('uint 8 array body', async t => {
  const b = new Body(new Uint8Array(stringToArrayBuffer('a=1')))
  t.equal(b.body.toString(), 'a=1')
  t.equal(Body.extractContentType(b.body), null)
})

t.test('stream body', async t => {
  const b = new Body(new Minipass({ encoding: 'utf8' }).end('a=1'))
  t.equal(Body.extractContentType(b.body), null)
  t.equal(await b.text(), 'a=1')
})

t.test('stream body with size', async t => {
  const b = new Body(new Minipass({ encoding: 'utf8' }).end('a=1'), { size: 3 })
  t.equal(Body.extractContentType(b.body), null)
  t.equal(await b.text(), 'a=1')
})

t.test('stream body with size thats already checking size', async t => {
  const b = new Body(new MinipassSized({ size: 3, encoding: 'utf8' }).end('a=1'), { size: 3 })
  t.equal(Body.extractContentType(b.body), null)
  t.equal(await b.text(), 'a=1')
})

t.test('stream body that is a core stream', async t => {
  const b = new Body(new PassThrough({ encoding: 'utf8' }).end('a=1'))
  t.equal(Body.extractContentType(b.body), null)
  t.equal(await b.text(), 'a=1')
})

t.test('stream body goes too long', async t => {
  const b = new Body(new PassThrough({ encoding: 'utf8' }).end('a=1'), { size: 1 })
  t.equal(Body.extractContentType(b.body), null)
  await t.rejects(b.text(), {
    name: 'FetchError',
    code: 'EBADSIZE',
  })
})

t.test('simulated buffer creation problem', async t => {
  const s = new PassThrough()
  const b = new Body(s)
  b.url = 'xyz'
  setTimeout(() => s.emit('error', new RangeError('hello')))
  await t.rejects(b.buffer(), {
    name: 'FetchError',
    message: 'Could not create Buffer from response body for xyz: hello',
    type: 'system',
  })
})

t.test('stream body too slow', async t => {
  const b = new Body(new Minipass(), { timeout: 1 })
  b.url = 'sloowwwwww'
  // keep the process open, like the actual HTTP channel would
  setTimeout(() => {}, 10)
  await t.rejects(b.text(), {
    name: 'FetchError',
    message: 'Response timeout while trying to fetch sloowwwwww (over 1ms)',
    type: 'body-timeout',
    code: 'FETCH_ERROR',
    errno: 'FETCH_ERROR',
  })
})

t.test('no timeout if stream ends before we even start consuming', async t => {
  // this test mimics how lib/index.js writes data into the intermediary minipass stream

  // the SlowMinipass class delays the result from concat() mimicking a slow pipe downstream
  class SlowMinipass extends Minipass {
    async concat () {
      // 10 millisecond delay before resolving
      await new Promise((resolve) => setTimeout(resolve, 10))
      return super.concat()
    }
  }
  const networkStream = new Minipass()
  const wrappedStream = new SlowMinipass()

  networkStream.on('data', (chunk) => wrappedStream.write(chunk))
  networkStream.on('end', () => wrappedStream.end())

  for (let i = 0; i < 10; ++i) {
    networkStream.write('some data')
  }
  networkStream.end()

  // timeout of 1ms, must be lower than the 10ms used in SlowMinipass to trigger the bug
  const b = new Body(wrappedStream, { timeout: 1 })
  await t.resolves(b.text(), 'some data')
})

t.test('random toString-ing thing body', async t => {
  const b = new Body({ toString () {
    return 'a=1'
  } })
  t.equal(b.body.toString(), 'a=1')
  t.equal(Body.extractContentType(b.body), null)
})

t.test('set size and timeout', async t => {
  const b = new Body('a=1', { size: 3, timeout: 1000 })
  t.equal(b.size, 3)
  t.equal(b.timeout, 1000)
  t.equal(Body.extractContentType(b.body), null)
})

t.test('body stream emits error', async t => {
  const errorer = new Minipass()
  const b = new Body(errorer)
  b.url = 'glorp'
  errorer.emit('error', new Error('poop'))
  await t.rejects(b.buffer(), {
    name: 'FetchError',
    message: 'Invalid response while trying to fetch glorp: poop',
    type: 'system',
  })
})

t.test('body stream emits AbortError', async t => {
  const aborter = new Minipass()
  const b = new Body(aborter)
  b.url = 'retroba'
  aborter.emit('error', new AbortError('bork'))
  await t.rejects(b.buffer(), {
    name: 'AbortError',
    message: 'bork',
  })
})

t.test('more static method coverage', async t => {
  t.equal(Body.extractContentType('a=1'), 'text/plain;charset=UTF-8')
  t.equal(Body.extractContentType(new URLSearchParams('a=1')),
    'application/x-www-form-urlencoded;charset=UTF-8')
  t.equal(Body.extractContentType(stringToArrayBuffer('a=1')), null)
  t.equal(Body.extractContentType(new Uint8Array(stringToArrayBuffer('a=1'))),
    null)
  t.equal(Body.extractContentType(new Blob()), null)
  t.equal(Body.extractContentType({}), 'text/plain;charset=UTF-8')
  t.equal(Body.getTotalBytes({ body: {} }), null)
})

t.test('json FetchError', async t => {
  t.same(await new Body('{"a":1}').json(), { a: 1 })
  await t.rejects(Object.assign(new Body('a=1'), { url: 'asdf' }).json(), {
    name: 'FetchError',
    message: 'invalid json response body at asdf reason: ' +
      'Unexpected token a in JSON at position 0',
    type: 'invalid-json',
  })
})

t.test('json body error', async t => {
  const s = new PassThrough()
  const b = new Body(s)
  b.url = 'xyz'
  setTimeout(() => s.emit('error', new RangeError('hello')))
  await t.rejects(b.json(), {
    name: 'FetchError',
    message: 'Could not create Buffer from response body for xyz: hello',
    type: 'system',
  })
})

t.test('handles environments where setTimeout does not have unref', async t => {
  const originalSetTimeout = setTimeout
  // simulate environments without unref()
  global.setTimeout = (func, time) =>
    Object.assign(originalSetTimeout(func, time), { unref: null })
  t.teardown(() => global.setTimeout = originalSetTimeout)

  t.doesNotThrow(async () => {
    const b = new Body(new Blob('a=1'), { timeout: 100 })
    await b.text()
    t.end()
  })
})

t.test('write to streams', async t => {
  const w = body => Body.writeToStream(
    new Minipass({ encoding: 'utf8' }),
    { body }
  ).concat()

  t.equal(await w(), '')
  t.equal(await w(new Blob()), '')
  t.equal(await w('a=1'), 'a=1')
  t.equal(await w(Buffer.from('a=1')), 'a=1')
  t.equal(await w(new Minipass().end('a=1')), 'a=1')
  const s = new Minipass()
  setTimeout(() => s.emit('error', new Error('asdf')))
  await t.rejects(w(s), { message: 'asdf' })
})

t.test('clone', t => {
  t.test('clone after use throws', async t => {
    const b = new Body('a=1')
    await b.text()
    t.throws(() => Body.clone(b), {
      message: 'cannot clone body after it is used',
    })
  })

  t.test('clone formdata returns the form data', async t => {
    const f = new FormData()
    f.append('a', '1')
    const b = new Body(f)
    t.equal(Body.clone(b), f)
  })

  t.test('clone buffer returns the buffer', async t => {
    const buf = Buffer.from('a=1')
    const b = new Body(buf)
    t.equal(Body.clone(b), buf)
  })

  t.test('clone stream tees the stream', async t => {
    const mp = new Minipass().end('a=1')
    const b = new Body(mp)
    const cloned = Body.clone(b)
    t.not(cloned, mp, 'new stream')
    t.not(b.body, mp, 'original body gets new stream')
    t.equal((await cloned.concat()).toString(), 'a=1')
    t.equal(await b.text(), 'a=1')
  })

  t.test('clone stream proxies errors to both', t => {
    const mp = new Minipass().end('a=1')
    const b = new Body(mp)
    const cloned = Body.clone(b)
    const x = new Error('yolo')
    t.plan(2)
    cloned.once('error', er => t.equal(er, x))
    b.body.once('error', er => t.equal(er, x))
    setTimeout(() => mp.emit('error', x))
  })

  t.end()
})

t.test('convert body', t => {
  const { convert } = require('encoding')

  t.test('content-type header', async t => {
    const s = '中文'
    const b = new Body(convert(s, 'gbk'))
    b.headers = { get () {
      return 'text/plain; charset=gbk; qs=1'
    } }
    t.equal(await b.textConverted(), s)
  })

  t.test('html4 meta tag', async t => {
    const s = '<meta http-equiv="Content-Type" content="text/html; charset=gbk"><div>中文L</div>'
    const b = new Body(convert(s, 'gbk'))
    t.equal(await b.textConverted(), s)
  })

  t.test('html4 meta tag reversed', async t => {
    const s = '<meta content="text/html; charset=gbk" http-equiv="Content-Type"><div>中文L</div>'
    const b = new Body(convert(s, 'gbk'))
    t.equal(await b.textConverted(), s)
  })

  t.test('html5 meta tag', async t => {
    const s = '<meta charset="gbk"><div>中文</div>'
    const b = new Body(convert(s, 'gbk'))
    t.equal(await b.textConverted(), s)
  })

  t.test('xml encoding', async t => {
    const s = '<?xml encoding="gbk"?><div>中文</div>'
    const b = new Body(convert(s, 'gbk'))
    t.equal(await b.textConverted(), s)
  })

  t.test('explicitly utf8', async t => {
    const s = '<?xml encoding="UTF-8"?><div>中文</div>'
    const b = new Body(s)
    t.equal(await b.textConverted(), s)
  })

  t.test('no encoding set', async t => {
    const s = '中文'
    const b = new Body(s)
    t.equal(await b.textConverted(), s)
  })

  t.end()
})
