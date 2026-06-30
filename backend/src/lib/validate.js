// Tiny dependency-free request-body validator. Define a spec per field and get
// an Express middleware that rejects malformed input with 400 before the route
// handler runs - closing the "routes accept any JSON shape" gap without pulling
// in a schema library.
//
// Spec example:
//   validateBody({
//     email:  { type: "email", required: true },
//     amount: { type: "number", required: true, min: 1, max: 1e9 },
//     plan:   { type: "string", enum: ["growth", "pro"] },
//     note:   { type: "string", maxLen: 500 },
//   })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkField(name, spec, value) {
  const missing = value === undefined || value === null || value === "";
  if (missing) {
    if (spec.required) return `${name} is required`;
    return null; // optional + absent → skip remaining checks
  }
  switch (spec.type) {
    case "string":
      if (typeof value !== "string") return `${name} must be a string`;
      if (spec.maxLen && value.length > spec.maxLen) return `${name} must be ≤ ${spec.maxLen} chars`;
      if (spec.minLen && value.length < spec.minLen) return `${name} must be ≥ ${spec.minLen} chars`;
      break;
    case "email":
      if (typeof value !== "string" || !EMAIL_RE.test(value)) return `${name} must be a valid email`;
      break;
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return `${name} must be a number`;
      if (spec.min !== undefined && n < spec.min) return `${name} must be ≥ ${spec.min}`;
      if (spec.max !== undefined && n > spec.max) return `${name} must be ≤ ${spec.max}`;
      break;
    }
    case "boolean":
      if (typeof value !== "boolean") return `${name} must be a boolean`;
      break;
    case "array":
      if (!Array.isArray(value)) return `${name} must be an array`;
      if (spec.maxLen && value.length > spec.maxLen) return `${name} must have ≤ ${spec.maxLen} items`;
      break;
    default:
      break;
  }
  if (spec.enum && !spec.enum.includes(value)) return `${name} must be one of: ${spec.enum.join(", ")}`;
  return null;
}

function validateBody(spec) {
  return (req, res, next) => {
    const body = req.body || {};
    for (const [name, fieldSpec] of Object.entries(spec)) {
      const err = checkField(name, fieldSpec, body[name]);
      if (err) return res.status(400).json({ error: err });
    }
    next();
  };
}

module.exports = { validateBody };
