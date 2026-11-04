export function isWebAuthnAvailable() {
  return typeof window !== "undefined"
    && window.isSecureContext
    && "PublicKeyCredential" in window
    && navigator.credentials;
}

function base64urlToArrayBuffer(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function arrayBufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function creationOptionsFromJSON(options) {
  return {
    ...options,
    challenge: base64urlToArrayBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64urlToArrayBuffer(options.user.id)
    },
    excludeCredentials: (options.excludeCredentials || []).map((credential) => ({
      ...credential,
      id: base64urlToArrayBuffer(credential.id)
    }))
  };
}

export function requestOptionsFromJSON(options) {
  return {
    ...options,
    challenge: base64urlToArrayBuffer(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((credential) => ({
      ...credential,
      id: base64urlToArrayBuffer(credential.id)
    }))
  };
}

export function serializePublicKeyCredential(credential) {
  if (!credential) return null;

  const response = credential.response;
  const payload = {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || "",
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    response: {
      clientDataJSON: arrayBufferToBase64url(response.clientDataJSON)
    }
  };

  if ("attestationObject" in response) {
    payload.response.attestationObject = arrayBufferToBase64url(response.attestationObject);
    payload.response.transports = typeof response.getTransports === "function" ? response.getTransports() : [];
  }

  if ("authenticatorData" in response) {
    payload.response.authenticatorData = arrayBufferToBase64url(response.authenticatorData);
    payload.response.signature = arrayBufferToBase64url(response.signature);
    payload.response.userHandle = response.userHandle ? arrayBufferToBase64url(response.userHandle) : "";
  }

  return payload;
}
