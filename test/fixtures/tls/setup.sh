#!/usr/bin/env bash



DOMAIN=localhost
CURRENT_DIR=$PWD;
cd $(cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd)
trap 'cd "${CURRENT_DIR}"' EXIT

rm -rf $DOMAIN.{crt,csr,ext,key}
rm -rf .srl

openssl req \
  -nodes \
  -newkey rsa:2048 \
  -keyout $DOMAIN.key \
  -out $DOMAIN.csr \
  -subj "/CN=$DOMAIN"

cat > $DOMAIN.ext << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names
[alt_names]
DNS.1 = $DOMAIN
EOF

openssl x509 \
  -req \
  -days 825 \
  -sha256 \
  -in $DOMAIN.csr \
  -CA ./minipass-CA.pem \
  -CAkey ./minipass-CA.key \
  -CAcreateserial \
  -out $DOMAIN.crt \
  -extfile $DOMAIN.ext \
  -passin pass:minipassphrase

rm -rf $DOMAIN.{csr,ext}
rm -rf .srl