'use strict'
const AbortError = require('../lib/abort-error.js')
const t = require('tap')
const ae = new AbortError('foo')
t.match(ae, {
  name: 'AbortError',
  stack: String,
  code: 'FETCH_ABORTED',
  type: 'aborted',
})
ae.name = 'foo'
t.equal(ae.name, 'AbortError', 'cannot override name')
