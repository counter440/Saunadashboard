#pragma once

// Let's Encrypt root certificates — both are needed because LE issues from
// both ISRG Root X1 (RSA, default for most certs) and ISRG Root X2 (ECDSA).
// mbedTLS accepts multiple PEMs in a single setCACert() string.
extern const char LE_ROOT_CA_BUNDLE[];
