'use strict'
const Blob = require('../lib/blob.js')
const t = require('tap')
const stringToArrayBuffer = require('string-to-arraybuffer')

t.test('null case', t => {
  const b = new Blob()
  t.equal(b.toString(), '[object Blob]')
  return b.text().then(res => t.equal(res, ''))
    .then(() => b.arrayBuffer())
    .then(buf => t.match(buf, Buffer.alloc(0)))
})

t.test('mix of stuff', t => {
  const b = new Blob([
    Buffer.from('one'),
    ' ',
    stringToArrayBuffer('two'),
    ' ',
    new Uint8Array(stringToArrayBuffer('three')),
    new Blob(' '),
    { toString () {
      return 'four'
    } },
  ], { type: 'foo' })
  const x = 'one two three four'
  t.equal(b.type, 'foo')
  t.equal(b.size, x.length)

  return b.text()
    .then(text => t.equal(text, x))
    .then(() => b.stream())
    .then(s => s.concat())
    .then(s => t.equal(s.toString(), x))
    .then(() => b.arrayBuffer())
    .then(ab => t.match(Buffer.from(ab), Buffer.from(x)))
})

t.test('slice', t => {
  const b = new Blob('1 2 3 4', { type: 'x' })
  const b1 = b.slice(2)
  t.equal(b1.type, '')
  const b2 = b.slice(2, 4, 'type')
  t.equal(b2.type, 'type')
  const b3 = b.slice(2, -2)
  const b4 = b.slice(-4)
  const b5 = b.slice(4, -4)
  const b6 = b.slice()
  return Promise.all([
    b1.text(),
    b2.text(),
    b3.text(),
    b4.text(),
    b5.text(),
    b6.text(),
  ]).then(([t1, t2, t3, t4, t5, t6]) =>
    t.strictSame({ t1, t2, t3, t4, t5, t6 }, {
      t1: '2 3 4',
      t2: '2 ',
      t3: '2 3',
      t4: ' 3 4',
      t5: '',
      t6: '1 2 3 4',
    }))
})

t.test('expose the BUFFER symbol as read-only static property', t => {
  t.match(Blob.BUFFER, Symbol('buffer'))
  t.throws(() => Blob.BUFFER = 'fubber')
  t.end()
})
