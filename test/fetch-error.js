'use strict'
const FetchError = require('../lib/fetch-error.js')
const t = require('tap')
t.test('no underlying error', t => {
  const fe = new FetchError('foo')
  t.match(fe, {
    message: 'foo',
    code: 'FETCH_ERROR',
    errno: 'FETCH_ERROR',
    type: undefined,
    stack: String,
    name: 'FetchError',
    constructor: FetchError,
  })
  fe.name = 'fooblz'
  t.equal(fe.name, 'FetchError', 'cannot override name')
  t.equal(Object.prototype.toString.call(fe), '[object FetchError]', 'sets toStringTag')
  t.equal(String(fe), 'FetchError: foo', 'name shows up in toString')
  t.end()
})

t.test('with underlying error', t => {
  const fe = new FetchError('xyz', 'xyz-problem', Object.assign(new Error('abc'), {
    code: 'ABC_ERROR',
    rando: 'property',
  }))
  t.match(fe, {
    message: 'xyz',
    code: 'ABC_ERROR',
    errno: 'ABC_ERROR',
    rando: 'property',
    type: 'xyz-problem',
    stack: String,
    name: 'FetchError',
    constructor: FetchError,
  })
  t.end()
})

t.test('special handling of EBADSIZE', t => {
  const fe = new FetchError('xyz', 'xyz-problem', Object.assign(new Error('abc'), {
    code: 'EBADSIZE',
    expect: 5,
    found: 50,
  }))
  t.match(fe, {
    message: 'xyz',
    code: 'EBADSIZE',
    errno: 'EBADSIZE',
    type: 'max-size',
    expect: 5,
    found: 50,
    stack: String,
    name: 'FetchError',
    constructor: FetchError,
  })
  t.end()
})

t.test('create custom FetchError', function funcName (t) {
  const systemError = new Error('system')
  systemError.code = 'ESOMEERROR'

  const err = new FetchError('test message', 'test-error', systemError)
  t.match(err, Error)
  t.match(err, FetchError)
  t.equal(err.name, 'FetchError')
  t.equal(err.message, 'test message')
  t.equal(err.type, 'test-error')
  t.equal(err.code, 'ESOMEERROR')
  t.equal(err.errno, 'ESOMEERROR')
  // reading the stack is quite slow (~30-50ms)
  t.match(err.stack, `${err.name}: ${err.message}`)
  t.match(err.stack, 'funcName')
  t.end()
})
