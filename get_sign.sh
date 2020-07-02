#!/bin/bash
which openssl
echo -n "$1" | openssl dgst -sha256 -sign myPrivateKey.pem | openssl base64 | tr -d '\n' 
