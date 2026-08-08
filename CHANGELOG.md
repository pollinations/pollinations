# Changelog

## 2026-07-16

- Hardened community endpoint URL validation to reject link-local, private IPv6, IPv4-mapped loopback, and unspecified IP hosts before proxying upstream requests.

## 2026-08-01

- Preserved source image aspect ratios for image-edit requests when `size` is omitted, with format-aware dimension parsing, proportional scaling, and explicit-size preservation.
