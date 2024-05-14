// verify that passing a custom CA cert will work with minipass-fetch
// Ie, going a different direction than the decision node-fetch made
// https://github.com/node-fetch/node-fetch/issues/15

const t = require('tap')
const { resolve } = require('path')
const { readFileSync: read } = require('fs')
const { createServer } = require('https')
const fetch = require('../')

const fixtures = resolve(__dirname, 'fixtures/tls')
const port = 30000 + (+process.env.TAP_CHILD_ID || 1)
const base = `https://localhost:${port}/`
const ca = read(`${fixtures}/minipass-CA.pem`)

// If any of these tests fail with a "certificate expired" error, then
// localhost.crt and localhost.key need to be regenerated with `npm run
// test:tls-fixtures`.

let server = null
t.before(() => new Promise((res) => {
  server = createServer({
    cert: read(`${fixtures}/localhost.crt`),
    key: read(`${fixtures}/localhost.key`),
  }, (q, s) => {
    s.setHeader('content-type', 'text/plain')
    s.setHeader('connection', 'close')
    s.end(`${q.method} ${q.url}`)
  }).listen(port, res)
}))
t.teardown(() => server.close())

const failure = {
  name: 'FetchError',
  message: `request to ${base}hello failed, reason: unable to verify the first certificate`,
  code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  errno: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  type: 'system',
}

// this test will fail after Jan 30 23:23:26 2025 GMT
t.test('make https request without ca, should fail', t =>
  t.rejects(fetch(`${base}hello`), failure))

t.test('make https request with NODE_TLS_REJECT_UNAUTHORIZED set to 1, should fail', async t => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1'
  t.rejects(fetch(`${base}hello`), failure)
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
})

t.test('make https request with rejectUnauthorized:true, should fail', async t =>
  t.rejects(fetch(`${base}hello`, { rejectUnauthorized: true }), failure))

t.test('make https request with NODE_TLS_REJECT_UNAUTHORIZED set to 0, succeeds', async t => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  t.equal(await (await fetch(`${base}hello`)).text(), 'GET /hello')
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
})

t.test('make https request with rejectUnauthorized:false, succeeds', async t =>
  t.equal(await (await fetch(`${base}hello`, { rejectUnauthorized: false })).text(),
    'GET /hello'))

t.test('make https request with ca, succeeds', async t =>
  t.equal(await (await fetch(`${base}hello`, { ca })).text(),
    'GET /hello'))
