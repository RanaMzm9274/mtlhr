const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
  "tempmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
]);

const COMMON_DOMAIN_TYPOS: Record<string, string> = {
  "gmil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmai.com": "gmail.com",
  "hotnail.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "yaho.com": "yahoo.com",
};

export const PASSWORD_POLICY = {
  minLength: 8,
  hasUpper: /[A-Z]/,
  hasLower: /[a-z]/,
  hasDigit: /\d/,
  hasSpecial: /[!@#$%^&*(),.?":{}|<>_\-\\[\]\\/+=~`]/,
};

export const getPasswordValidation = (value: string) => {
  const password = value || "";
  return {
    minLength: password.length >= PASSWORD_POLICY.minLength,
    upper: PASSWORD_POLICY.hasUpper.test(password),
    lower: PASSWORD_POLICY.hasLower.test(password),
    digit: PASSWORD_POLICY.hasDigit.test(password),
    special: PASSWORD_POLICY.hasSpecial.test(password),
  };
};

export const isStrongPassword = (value: string) => {
  const checks = getPasswordValidation(value);
  return checks.minLength && checks.special;
};

export const validateBusinessEmail = (emailInput: string) => {
  const email = (emailInput || "").trim().toLowerCase();
  if (!email) return { valid: false, message: "Email is required." };
  if (email.length > 254) return { valid: false, message: "Email is too long." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { valid: false, message: "Enter a valid email address." };

  const domain = email.split("@")[1] || "";
  if (!domain || domain.startsWith(".") || domain.endsWith(".") || !domain.includes(".")) {
    return { valid: false, message: "Email domain is invalid." };
  }
  if (domain.includes("..")) return { valid: false, message: "Email domain is invalid." };
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return { valid: false, message: "Temporary/disposable email addresses are not allowed." };
  }
  if (COMMON_DOMAIN_TYPOS[domain]) {
    return { valid: false, message: `Did you mean ${COMMON_DOMAIN_TYPOS[domain]}?` };
  }

  return { valid: true, message: "" };
};
