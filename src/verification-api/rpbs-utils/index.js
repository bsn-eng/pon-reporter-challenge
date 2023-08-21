const R = require('@blockswaplab/rpbs-self-attestation');
const BN = require("bn.js");

function utf8ToHex(str) {
    return '0x' + Array.from(str).map(c =>
        c.charCodeAt(0) < 128 ? c.charCodeAt(0).toString(16) :
            encodeURIComponent(c).replace(/\%/g,'').toLowerCase()
    ).join('');
}

const unmarshallRPBSSignature = (sig) => {
    let signature = Object.assign({}, sig);
    signature.z1Hat = R.curveOperations.decodePointInRPBSFormat(
        signature.z1Hat
    );
    signature.c1Hat = R.curveOperations.reduceHexToGroup(
        new BN(signature.c1Hat, 16)
    );
    signature.s1Hat = R.curveOperations.reduceHexToGroup(
        new BN(signature.s1Hat, 16)
    );
    signature.c2Hat = R.curveOperations.reduceHexToGroup(
        new BN(signature.c2Hat, 16)
    );
    signature.s2Hat = R.curveOperations.reduceHexToGroup(
        new BN(signature.s2Hat, 16)
    );
    signature.m1Hat = R.curveOperations.decodePointInRPBSFormat(
        signature.m1Hat
    );
    return signature;
}

const isSignatureValid = (signature, commonInfo, publicKey) => {
    return R.rpbs.verifySignature(
        R.curveOperations.decodePointInRPBSFormat(publicKey),
        commonInfo,
        signature
    );
}

const marshalRPBSSignatureToHex = (sig) => {
    return utf8ToHex(Object.keys(sig).map(
        k => sig[k]
    ).join(':'))
}

module.exports = {
    unmarshallRPBSSignature,
    isSignatureValid,
    marshalRPBSSignatureToHex
}