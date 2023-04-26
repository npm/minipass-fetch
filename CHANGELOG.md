# Changelog

## [3.0.3](https://github.com/npm/minipass-fetch/compare/v3.0.2...v3.0.3) (2023-04-26)

### Dependencies

* [`7b5c016`](https://github.com/npm/minipass-fetch/commit/7b5c016c94a2ded9070f8a781895244fecb354c0) [#96](https://github.com/npm/minipass-fetch/pull/96) bump minipass from 4.2.7 to 5.0.0 (#96)

## [3.0.2](https://github.com/npm/minipass-fetch/compare/v3.0.1...v3.0.2) (2023-04-13)

### Bug Fixes

* [`3c40fdc`](https://github.com/npm/minipass-fetch/commit/3c40fdc8f179182bf9142b96e072a07bc9df746a) handle invalid redirect header in a response (#100) (@wraithgar, Mohammad macbook)
* [`cc962bc`](https://github.com/npm/minipass-fetch/commit/cc962bc03337d2f189a72e5a521b85289398f45d) Support longer timeouts - Inform http/tls timeout of chosen timeout (@josh-hemphill)

## [3.0.1](https://github.com/npm/minipass-fetch/compare/v3.0.0...v3.0.1) (2022-12-07)

### Dependencies

* [`1bb15fc`](https://github.com/npm/minipass-fetch/commit/1bb15fc33e873a29adb02149ee017b2c25c8a831) [#87](https://github.com/npm/minipass-fetch/pull/87) bump minipass from 3.3.6 to 4.0.0

## [3.0.0](https://github.com/npm/minipass-fetch/compare/v2.1.2...v3.0.0) (2022-10-10)

### ⚠️ BREAKING CHANGES

* `minipass-fetch` is now compatible with the following semver range for node: `^14.17.0 || ^16.13.0 || >=18.0.0`

### Features

* [`144dc38`](https://github.com/npm/minipass-fetch/commit/144dc38eb2e3be72ed916d426fc0063bd6cfacd4) [#74](https://github.com/npm/minipass-fetch/pull/74) postinstall for dependabot template-oss PR (@lukekarrys)

## [2.1.2](https://github.com/npm/minipass-fetch/compare/v2.1.1...v2.1.2) (2022-08-22)


### Bug Fixes

* **json:** don't catch body errors ([#64](https://github.com/npm/minipass-fetch/issues/64)) ([9658a0a](https://github.com/npm/minipass-fetch/commit/9658a0a60349b38e62011a22ab6e9079c4319e98))

## [2.1.1](https://github.com/npm/minipass-fetch/compare/v2.1.0...v2.1.1) (2022-08-17)


### Bug Fixes

* linting ([d2045cb](https://github.com/npm/minipass-fetch/commit/d2045cb25afb77e8c8f5c7551209922a16d5b215))

## [2.1.0](https://github.com/npm/minipass-fetch/compare/v2.0.3...v2.1.0) (2022-03-24)


### Features

* expose AbortError directly ([ed9d420](https://github.com/npm/minipass-fetch/commit/ed9d42026676a32e126e867186e2578e78e963f4))


### Bug Fixes

* do not setup the response timeout if the stream has already ended ([#53](https://github.com/npm/minipass-fetch/issues/53)) ([0feea3c](https://github.com/npm/minipass-fetch/commit/0feea3cf399b6a1888f3cf3292a12675c2306b4d))

### [2.0.3](https://www.github.com/npm/minipass-fetch/compare/v2.0.2...v2.0.3) (2022-03-08)


### Bug Fixes

* strip authorization and cookie headers on redirect to new host ([#45](https://www.github.com/npm/minipass-fetch/issues/45)) ([50d919a](https://www.github.com/npm/minipass-fetch/commit/50d919aafce3b95a8237a6e2dc93ae7e4215650f))

### [2.0.2](https://www.github.com/npm/minipass-fetch/compare/v2.0.1...v2.0.2) (2022-03-02)


### Bug Fixes

* pass search params as part of path string ([#40](https://www.github.com/npm/minipass-fetch/issues/40)) ([404ad4c](https://www.github.com/npm/minipass-fetch/commit/404ad4cf1a2c21563205bee21ca1ef785b31c72f))

### [2.0.1](https://www.github.com/npm/minipass-fetch/compare/v2.0.0...v2.0.1) (2022-03-01)


### Bug Fixes

* [#18](https://www.github.com/npm/minipass-fetch/issues/18) ([3a11fe4](https://www.github.com/npm/minipass-fetch/commit/3a11fe4c18587b61d4e212d332338bd3427f5894))
* Handle data: URIs more consistently ([#19](https://www.github.com/npm/minipass-fetch/issues/19)) ([3a11fe4](https://www.github.com/npm/minipass-fetch/commit/3a11fe4c18587b61d4e212d332338bd3427f5894)), closes [#18](https://www.github.com/npm/minipass-fetch/issues/18)


### Dependencies

* update encoding requirement from ^0.1.12 to ^0.1.13 ([#34](https://www.github.com/npm/minipass-fetch/issues/34)) ([65602ff](https://www.github.com/npm/minipass-fetch/commit/65602ffed38947efb13e907a165ebde22423cac9))

## [2.0.0](https://www.github.com/npm/minipass-fetch/compare/v1.4.1...v2.0.0) (2022-02-24)


### ⚠ BREAKING CHANGES

* this removes the (hopefully) unused feature that arbitrary strings are allowed as URLs in the Request constructor. we now require that URLs are valid and absolute.
* this drops support for node versions older than 12 LTS

### Bug Fixes

* check for existence of unref before calling ([05fb45b](https://www.github.com/npm/minipass-fetch/commit/05fb45b2289045899b8e762e0f16ff9dd6bbd767)), closes [#13](https://www.github.com/npm/minipass-fetch/issues/13)
* ensure we abort a request that emits error on the response body ([#25](https://www.github.com/npm/minipass-fetch/issues/25)) ([5565cde](https://www.github.com/npm/minipass-fetch/commit/5565cdef3cbcd0bc286794c42695f5ec2da83264))
* implement @npmcli/template-oss ([#26](https://www.github.com/npm/minipass-fetch/issues/26)) ([df5e1d2](https://www.github.com/npm/minipass-fetch/commit/df5e1d281372f88ecb8435aaec8ffa1712546390))
* use URL constructor instead of url.parse() ([#33](https://www.github.com/npm/minipass-fetch/issues/33)) ([f96f3b1](https://www.github.com/npm/minipass-fetch/commit/f96f3b13e68f3851fd9fadb762c58f441a4c3f48))


### Dependencies

* update minipass requirement from ^3.1.0 to ^3.1.6 ([#30](https://www.github.com/npm/minipass-fetch/issues/30)) ([4ce93e5](https://www.github.com/npm/minipass-fetch/commit/4ce93e5dd28b56457721454bea63f3c37b0d50d3))
* update minizlib requirement from ^2.0.0 to ^2.1.2 ([#29](https://www.github.com/npm/minipass-fetch/issues/29)) ([44e8701](https://www.github.com/npm/minipass-fetch/commit/44e8701d6c142223f6abe54c42f6e5a3d43707d7))
