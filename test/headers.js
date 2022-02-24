const t = require('tap')
const Headers = require('../lib/headers.js')

t.Test.prototype.addAssert('contain', 2, function (list, key, m, e) {
  m = m || 'expected item to be contained in list'
  e.found = list
  e.wanted = key
  return this.ok(list.indexOf(key) !== -1, m, e)
})
t.Test.prototype.addAssert('notContain', 2, function (list, key, m, e) {
  m = m || 'expected item to not be contained in list'
  e.found = list
  e.wanted = key
  return this.notOk(list.indexOf(key) !== -1, m, e)
})

t.test('should have attributes conforming to Web IDL', t => {
  const headers = new Headers()
  t.same(Object.getOwnPropertyNames(headers), [])
  const enumerableProperties = []
  for (const property in headers) {
    enumerableProperties.push(property)
  }
  t.same(enumerableProperties.sort(), [
    'append',
    'delete',
    'entries',
    'forEach',
    'get',
    'has',
    'keys',
    'set',
    'values',
  ])

  t.equal(String(headers), '[object Headers]')

  t.end()
})

t.test('not-found key returns null', t => {
  const h = new Headers([['foo', 'bar']])
  t.equal(h.has('baz'), false)
  t.equal(h.get('baz'), null)
  t.end()
})

t.test('set two times', t => {
  const h = new Headers()
  h.set('foo', 'bar')
  h.set('foo', 'baz')
  t.equal(h.get('foo'), 'baz')
  h.append('foo', 'bar')
  t.equal(h.get('foo'), 'baz, bar')
  t.end()
})

t.test('node compatible headers', t => {
  const h = new Headers()
  h.set('foo', 'bar')
  t.same(Headers.exportNodeCompatibleHeaders(h), {
    foo: ['bar'],
  })
  h.set('host', 'example.com')
  t.same(Headers.exportNodeCompatibleHeaders(h), {
    foo: ['bar'],
    host: 'example.com',
  })
  t.end()
})

t.test('create headers lenient', t => {
  const h = Headers.createHeadersLenient({
    '💩': ['ignore', 'these'],
    badList: ['ok', '💩', 'bar'],
    badStr: '💩',
    goodstr: 'good',
  })

  t.same(Headers.exportNodeCompatibleHeaders(h), {
    badList: ['ok', 'bar'],
    goodstr: ['good'],
  })

  t.end()
})

t.test('delete', t => {
  const h = new Headers([['foo', 'bar']])
  t.equal(h.has('foo'), true)
  h.delete('foo')
  t.equal(h.has('foo'), false)
  // another time just to make sure it's fine with that, and for coverage
  h.delete('foo')
  t.end()
})

t.test('iterating through all headers with forEach', t => {
  const headers = new Headers([
    ['b', '2'],
    ['c', '4'],
    ['b', '3'],
    ['a', '1'],
  ])

  const result = []
  headers.forEach((val, key) => {
    result.push([key, val])
  })

  t.same(result, [
    ['a', '1'],
    ['b', '2, 3'],
    ['c', '4'],
  ])

  t.end()
})

t.test('iteration', t => {
  const headers = new Headers([
    ['b', '2'],
    ['c', '4'],
    ['a', '1'],
  ])
  headers.append('b', '3')

  const result = []
  for (const pair of headers) {
    result.push(pair)
  }
  t.same(result, [
    ['a', '1'],
    ['b', '2, 3'],
    ['c', '4'],
  ], 'iterating with for loop')

  t.same(Array.from(headers.entries()), [
    ['a', '1'],
    ['b', '2, 3'],
    ['c', '4'],
  ], 'entries')

  const keys = headers.keys()
  t.equal(String(keys), '[object HeadersIterator]')
  t.same(Array.from(keys), ['a', 'b', 'c'], 'keys')

  t.same(Array.from(headers.values()), ['1', '2, 3', '4'], 'values')

  t.end()
})

t.test('reject illegal header', t => {
  const headers = new Headers()
  t.throws(() => new Headers({ 'He y': 'ok' }), TypeError)
  t.throws(() => new Headers({ 'Hé-y': 'ok' }), TypeError)
  t.throws(() => new Headers({ 'He-y': 'ăk' }), TypeError)
  t.throws(() => headers.append('Hé-y', 'ok'), TypeError)
  t.throws(() => headers.delete('Hé-y'), TypeError)
  t.throws(() => headers.get('Hé-y'), TypeError)
  t.throws(() => headers.has('Hé-y'), TypeError)
  t.throws(() => headers.set('Hé-y', 'ok'), TypeError)
  // should reject empty header
  t.throws(() => headers.append('', 'ok'), TypeError)

  // 'o k' is valid value but invalid name
  new Headers({ 'He-y': 'o k' })

  t.end()
})

t.test('should ignore unsupported attributes while reading headers', t => {
  class FakeHeader {}
  // prototypes are currently ignored
  // This might change in the future: #181
  FakeHeader.prototype.z = 'fake'

  const res = new FakeHeader()
  res.a = 'string'
  res.b = ['1', '2']
  res.c = ''
  res.d = []
  res.e = 1
  res.f = [1, 2]
  res.g = { a: 1 }
  res.h = undefined
  res.i = null
  res.j = NaN
  res.k = true
  res.l = false
  res.m = Buffer.from('test')

  const h1 = new Headers(res)
  h1.set('n', [1, 2])
  h1.append('n', ['3', 4])

  const h1Raw = h1.raw()

  t.contain(h1Raw.a, 'string')
  t.contain(h1Raw.b, '1,2')
  t.contain(h1Raw.c, '')
  t.contain(h1Raw.d, '')
  t.contain(h1Raw.e, '1')
  t.contain(h1Raw.f, '1,2')
  t.contain(h1Raw.g, '[object Object]')
  t.contain(h1Raw.h, 'undefined')
  t.contain(h1Raw.i, 'null')
  t.contain(h1Raw.j, 'NaN')
  t.contain(h1Raw.k, 'true')
  t.contain(h1Raw.l, 'false')
  t.contain(h1Raw.m, 'test')
  t.contain(h1Raw.n, '1,2')
  t.contain(h1Raw.n, '3,4')

  t.equal(h1Raw.z, undefined)

  t.end()
})

t.test('should wrap headers', t => {
  const h1 = new Headers({ a: '1' })
  const h1Raw = h1.raw()

  const h2 = new Headers(h1)
  h2.set('b', '1')
  const h2Raw = h2.raw()

  const h3 = new Headers(h2)
  h3.append('a', '2')
  const h3Raw = h3.raw()

  t.contain(h1Raw.a, '1')
  t.notContain(h1Raw.a, '2')

  t.contain(h2Raw.a, '1')
  t.notContain(h2Raw.a, '2')
  t.contain(h2Raw.b, '1')

  t.contain(h3Raw.a, '1')
  t.contain(h3Raw.a, '2')
  t.contain(h3Raw.b, '1')

  t.end()
})

t.test('should accept headers as an iterable of tuples', t => {
  let headers

  headers = new Headers([
    ['a', '1'],
    ['b', '2'],
    ['a', '3'],
  ])
  t.equal(headers.get('a'), '1, 3')
  t.equal(headers.get('b'), '2')

  headers = new Headers([
    new Set(['a', '1']),
    ['b', '2'],
    new Map([['a', null], ['3', null]]).keys(),
  ])
  t.equal(headers.get('a'), '1, 3')
  t.equal(headers.get('b'), '2')

  headers = new Headers(new Map([
    ['a', '1'],
    ['b', '2'],
  ]))
  t.equal(headers.get('a'), '1')
  t.equal(headers.get('b'), '2')
  t.end()
})

t.test('should throw a TypeError if non-tuple exists in a headers initializer', t => {
  t.throws(() => new Headers([['b', '2', 'huh?']]), TypeError)
  t.throws(() => new Headers(['b2']), TypeError)
  t.throws(() => new Headers('b2'), TypeError)
  t.throws(() => new Headers({ [Symbol.iterator]: 42 }), TypeError)
  t.end()
})
