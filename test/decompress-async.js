'use strict'
const t = require('tap')
const fetch = require('../lib/index.js')
const realZlib = require('zlib')
const nock = require('nock')

// We additionally test decompression here using nock as it seems to recreate a
// hard to diagnose condition: https://github.com/npm/minipass-fetch/issues/166
// If you see `test unfinished` this file has done its job and you need to find
// why the stream died early. The above ticket has details.

t.test('decompress response when using async pipe', async t => {
  t.test('using gzip', async t => {
    const input = 'hello world'
    const gzipd = realZlib.gzipSync(Buffer.from(input, 'utf8'))
    nock('http://a.b', { allowUnmocked: false })
      .get('/gzip')
      .reply(200, gzipd, {
        'Content-Type': 'text/plain',
        'Content-Encoding': 'gzip',
      })

    const res = await fetch('http://a.b/gzip')
    const result = await res.text()
    t.equal(result, input, 'gzip response processed correctly when using async pipe')
    t.end()
  })

  t.test('using deflate', async t => {
    const input = 'hello world'
    const deflated = realZlib.deflateSync(Buffer.from(input, 'utf8'))
    nock('http://a.b', { allowUnmocked: false })
      .get('/deflate')
      .reply(200, deflated, {
        'Content-Type': 'text/plain',
        'Content-Encoding': 'deflate',
      })

    const res = await fetch('http://a.b/deflate')
    const result = await res.text()
    t.equal(result, input, 'deflate response processed correctly when using async pipe')
    t.end()
  })

  t.test('using deflate raw', async t => {
    const input = 'hello world'
    const deflated = realZlib.deflateRawSync(Buffer.from(input, 'utf8'))
    nock('http://a.b', { allowUnmocked: false })
      .get('/deflate')
      .reply(200, deflated, {
        'Content-Type': 'text/plain',
        'Content-Encoding': 'deflate',
      })

    const res = await fetch('http://a.b/deflate')
    const result = await res.text()
    t.equal(result, input, 'deflate raw response processed correctly when using async pipe')
    t.end()
  })

  t.test('using brotli', async t => {
    const input = 'hello world'
    const brotlid = realZlib.brotliCompressSync(Buffer.from(input, 'utf8'))
    nock('http://a.b', { allowUnmocked: false })
      .get('/brotli')
      .reply(200, brotlid, {
        'Content-Type': 'text/plain',
        'Content-Encoding': 'br',
      })

    const res = await fetch('http://a.b/brotli')
    const result = await res.text()
    t.equal(result, input, 'brotli response processed correctly when using async pipe')
    t.end()
  })
})
