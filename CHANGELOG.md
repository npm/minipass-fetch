# Changelog

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
