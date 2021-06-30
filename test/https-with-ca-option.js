// verify that passing a custom CA cert will work with minipass-fetch
// Ie, going a different direction than the decision node-fetch made
// https://github.com/node-fetch/node-fetch/issues/15
const t = require('tap')
const fetch = require('../')
const { resolve } = require('path')
const fixtures = resolve(__dirname, 'fixtures/tls')
const { readFileSync: read } = require('fs')

const ca = read(`${fixtures}/minipass-CA.pem`)
const cert = read(`${fixtures}/localhost.crt`)
const key = read(`${fixtures}/localhost.key`)
const { createServer } = require('https')
const port = 30000 + (+process.env.TAP_CHILD_ID || 1)
const base = `https://localhost:${port}/`

t.test('setup server', { bail: true }, t => {
  const server = createServer({
    cert,
    key,
  }, (q, s) => {
    s.setHeader('content-type', 'text/plain')
    s.setHeader('connection', 'close')
    s.end(`${q.method} ${q.url}`)
  })
  server.listen(port, () => {
    t.parent.teardown(() => server.close())
    t.end()
  })
})

t.test('make https request without ca, should fail', t =>
  t.rejects(fetch(`${base}hello`), {
    name: 'FetchError',
    message: `request to ${base}hello failed, reason: unable to verify the first certificate`,
    code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    errno: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    type: 'system',
  }))

t.test('make https request with rejectUnauthorized:false, succeeds', async t =>
  t.equal(await (await fetch(`${base}hello`, { rejectUnauthorized: false })).text(),
    'GET /hello'))

t.test('make https request with ca, succeeds', async t =>
  t.equal(await (await fetch(`${base}hello`, { ca })).text(),
    'GET /hello'))
