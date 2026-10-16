/*
 * Printing Money — purchase-request form for the free static edition (GitHub Pages).
 *
 * The page is plain HTML captured from the real site by scripts/build-static-site.ts.
 * This script gives the captured form the same behavior as the React form
 * (src/components/purchase/PurchaseRequestForm.tsx): the same validation messages,
 * error summary, field errors, aria-invalid / aria-describedby, character count and
 * "Sending your request…" state. When the details are valid it lets the browser post
 * the form to FormSubmit, which emails Hakeem (Reply-To = the customer), shows a quick
 * "I'm not a robot" check, emails the customer an acknowledgment, and returns them
 * to /request-received/.
 *
 * Only hidden fields are posted (the visible inputs have no name), so the owner email
 * always lists every detail in a fixed order with "Not provided" for blank fields.
 *
 * validate() must stay identical to src/lib/validation/purchase-request.ts —
 * tests/unit/static-request-form.test.ts compares them on many inputs.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (root && root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', function () {
        api.init(root);
      });
    } else {
      api.init(root);
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FIELD_ORDER = ['fullName', 'email', 'phone', 'organization', 'message', 'acknowledgment'];
  var LIMITS = { fullName: { min: 2, max: 100 }, email: { max: 254 }, phone: { max: 30 }, organization: { max: 150 }, message: { max: 2000 } };

  var ERROR_SUMMARY_HEADING = 'Please fix the following';
  var SENDING_LABEL = 'Sending your request…';
  var NOT_PROVIDED = 'Not provided';
  var COUNT_ANNOUNCE_THRESHOLD = 100;

  // C0/C1 control characters except tab/newline (allowed only in message).
  var CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
  var LINE_BREAKS = /[\r\n\u2028\u2029]/;
  // Zod's default email pattern (z.email()).
  var EMAIL = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
  var PHONE = /^[0-9+().\-\s]*(?:\s*(?:ext\.?|x)\s*\d{1,6})?$/i;
  var LETTER = (function () {
    try {
      return new RegExp('\\p{L}', 'u');
    } catch {
      return /[A-Za-zÀ-ɏ]/; // very old browsers
    }
  })();

  var REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // as src/lib/crypto.ts: no 0/O, 1/I/L

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function str(v) {
    return typeof v === 'string' ? v : '';
  }

  function singleLineIssue(label, max, s) {
    if (s.length > max) return capitalize(label) + ' must be ' + max + ' characters or fewer.';
    if (CONTROL_CHARS.test(s) || LINE_BREAKS.test(s)) return capitalize(label) + " contains characters that aren't allowed.";
    return undefined;
  }

  /** First error per field, exactly as validatePurchaseRequest() reports it. */
  function validate(values) {
    var errors = {};
    var fullName = str(values.fullName).trim();
    var nameIssue =
      singleLineIssue('full name', LIMITS.fullName.max, fullName) ||
      (fullName.length < LIMITS.fullName.min || !LETTER.test(fullName) ? 'Please enter your full name.' : undefined);
    if (nameIssue) errors.fullName = nameIssue;

    var email = str(values.email).trim();
    if (!email) errors.email = 'Please enter your email address.';
    else if (email.length > LIMITS.email.max) errors.email = 'Email address is too long.';
    else if (!EMAIL.test(email)) errors.email = 'Please enter a valid email address, like name@example.com.';

    var phone = str(values.phone).trim();
    if (phone) {
      var phoneIssue =
        singleLineIssue('phone number', LIMITS.phone.max, phone) ||
        (!PHONE.test(phone) || (phone.match(/\d/g) || []).length < 7 ? 'Please enter a valid phone number, or leave it blank.' : undefined);
      if (phoneIssue) errors.phone = phoneIssue;
    }

    var organization = str(values.organization).trim();
    if (organization) {
      var orgIssue = singleLineIssue('business or organization', LIMITS.organization.max, organization);
      if (orgIssue) errors.organization = orgIssue;
    }

    var message = str(values.message).trim();
    if (message) {
      if (message.length > LIMITS.message.max) errors.message = 'Message must be ' + LIMITS.message.max + ' characters or fewer.';
      else if (CONTROL_CHARS.test(message)) errors.message = 'Message contains characters that aren’t allowed.';
    }

    if (values.acknowledgment !== true) {
      errors.acknowledgment = 'Please confirm that you understand this is a request to purchase and that you will receive a payment link by email.';
    }
    return errors;
  }

  /** Human-friendly request reference such as PM-REQ-7K3F9QXA (same format as the full site). */
  function generateReference(cryptoObj) {
    var c = cryptoObj || (typeof self !== 'undefined' ? self.crypto : undefined);
    var out = '';
    var limit = 256 - (256 % REF_ALPHABET.length); // rejection sampling: no modulo bias
    while (out.length < 8) {
      var bytes = new Uint8Array(16);
      if (c && c.getRandomValues) c.getRandomValues(bytes);
      else for (var k = 0; k < bytes.length; k++) bytes[k] = Math.floor(Math.random() * 256);
      for (var i = 0; i < bytes.length && out.length < 8; i++) {
        if (bytes[i] < limit) out += REF_ALPHABET.charAt(bytes[i] % REF_ALPHABET.length);
      }
    }
    return 'PM-REQ-' + out;
  }

  function formatSubmitted(date, timeZone) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(date);
    } catch {
      return date.toISOString();
    }
  }

  /** True when the honeypot holds a value the browser autofilled (a person), not one a bot typed. */
  function isAutofilled(el) {
    var selectors = [':autofill', ':-webkit-autofill'];
    for (var i = 0; i < selectors.length; i++) {
      try {
        if (el.matches(selectors[i])) return true;
      } catch {
        /* selector unsupported */
      }
    }
    return false;
  }

  function init(win) {
    var doc = win.document;
    var form = doc.querySelector('form[data-static-request-form]');
    var configEl = doc.getElementById('pm-static-form-config');
    if (!form || !configEl) return;
    var config = JSON.parse(configEl.textContent || '{}');

    // CSS-module class names, e.g. "PurchaseRequestForm-module__lYWwMW__error".
    var prefixMatch = /(?:^|\s)(\S+__)form(?:\s|$)/.exec(form.className);
    var classPrefix = prefixMatch ? prefixMatch[1] : '';
    function cls(name) {
      return classPrefix + name;
    }
    var idPrefix = form.getAttribute('data-id-prefix') || 'purchase';

    var fields = {};
    for (var i = 0; i < FIELD_ORDER.length; i++) {
      fields[FIELD_ORDER[i]] = form.querySelector('[data-field="' + FIELD_ORDER[i] + '"]');
      if (!fields[FIELD_ORDER[i]]) return;
    }
    var submit = form.querySelector('button[type="submit"]');
    var submitLabel = submit ? submit.textContent : '';
    var submitLive = form.querySelector('[data-submit-live]');
    var countEl = doc.getElementById(fields.message.id + '-count');
    var countLive = form.querySelector('[data-count-live]');
    var honeypot = form.querySelector('[data-honeypot]');

    var errors = {};
    var touched = {};
    var dirty = {};
    var submitAttempted = false;
    var summaryVisible = false;
    var summary = null;
    var inFlight = false;
    var countTimer = null;

    function values() {
      return {
        fullName: fields.fullName.value,
        email: fields.email.value,
        phone: fields.phone.value,
        organization: fields.organization.value,
        message: fields.message.value,
        acknowledgment: fields.acknowledgment.checked,
      };
    }

    function errorIdFor(field) {
      return fields[field].id + '-error';
    }

    function renderFieldError(field) {
      var input = fields[field];
      var id = errorIdFor(field);
      var existing = doc.getElementById(id);
      var message = errors[field];
      var describedBy = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (x) {
        return x && x !== id;
      });
      if (!message) {
        if (existing) existing.parentNode.removeChild(existing);
        input.removeAttribute('aria-invalid');
      } else {
        var p = existing || doc.createElement('p');
        p.id = id;
        p.className = 'field__error ' + cls('error');
        while (p.firstChild) p.removeChild(p.firstChild);
        var icon = doc.createElement('span');
        icon.className = cls('errorIcon');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '!';
        var text = doc.createElement('span');
        var hidden = doc.createElement('span');
        hidden.className = 'visually-hidden';
        hidden.textContent = 'Error: ';
        text.appendChild(hidden);
        text.appendChild(doc.createTextNode(message));
        p.appendChild(icon);
        p.appendChild(text);
        if (!existing) input.closest('.field').appendChild(p);
        input.setAttribute('aria-invalid', 'true');
        describedBy.push(id);
      }
      if (describedBy.length) input.setAttribute('aria-describedby', describedBy.join(' '));
      else input.removeAttribute('aria-describedby');
    }

    function renderSummary(focus) {
      var list = FIELD_ORDER.filter(function (f) {
        return errors[f];
      });
      if (!summaryVisible || !list.length) {
        if (summary) summary.parentNode.removeChild(summary);
        summary = null;
        return;
      }
      if (!summary) {
        summary = doc.createElement('div');
        summary.className = 'notice notice--error ' + cls('summary');
        summary.setAttribute('role', 'alert');
        summary.tabIndex = -1;
        summary.setAttribute('aria-labelledby', idPrefix + '-error-summary-title');
        form.insertBefore(summary, form.firstChild);
      }
      while (summary.firstChild) summary.removeChild(summary.firstChild);
      var heading = doc.createElement('h3');
      heading.id = idPrefix + '-error-summary-title';
      heading.className = cls('summaryTitle');
      heading.textContent = ERROR_SUMMARY_HEADING;
      var ul = doc.createElement('ul');
      ul.className = cls('summaryList');
      list.forEach(function (field) {
        var li = doc.createElement('li');
        var a = doc.createElement('a');
        a.href = '#' + fields[field].id;
        a.textContent = errors[field];
        a.addEventListener('click', function (event) {
          event.preventDefault();
          fields[field].focus();
          fields[field].scrollIntoView({ block: 'center', behavior: 'auto' });
        });
        li.appendChild(a);
        ul.appendChild(li);
      });
      summary.appendChild(heading);
      summary.appendChild(ul);
      if (focus) summary.focus();
    }

    function setFieldError(field, message) {
      if (errors[field] === message) return;
      if (message) errors[field] = message;
      else delete errors[field];
      renderFieldError(field);
      if (summaryVisible) renderSummary(false);
    }

    function showAllErrors(next) {
      errors = next;
      FIELD_ORDER.forEach(renderFieldError);
      summaryVisible = Object.keys(next).length > 0;
      renderSummary(summaryVisible);
    }

    function updateCount() {
      if (!countEl) return;
      var remaining = LIMITS.message.max - fields.message.value.length;
      countEl.textContent = remaining.toLocaleString('en-US') + ' ' + (remaining === 1 ? 'character' : 'characters') + ' remaining';
      if (!countLive) return;
      clearTimeout(countTimer);
      countTimer = setTimeout(function () {
        countLive.textContent =
          remaining <= COUNT_ANNOUNCE_THRESHOLD
            ? remaining.toLocaleString('en-US') + ' ' + (remaining === 1 ? 'character' : 'characters') + ' remaining'
            : '';
      }, 900);
    }

    FIELD_ORDER.forEach(function (field) {
      var el = fields[field];
      var isCheckbox = field === 'acknowledgment';
      el.addEventListener(isCheckbox ? 'change' : 'input', function () {
        dirty[field] = true;
        if (isCheckbox) touched[field] = true;
        if (touched[field] || submitAttempted || errors[field]) setFieldError(field, validate(values())[field]);
        if (field === 'message') updateCount();
      });
      if (!isCheckbox) {
        el.addEventListener('blur', function () {
          // Don't flag a field the user merely tabbed through.
          if (!dirty[field] && !submitAttempted) return;
          touched[field] = true;
          setFieldError(field, validate(values())[field]);
        });
      }
    });

    function setPayload(name, value) {
      var input = form.querySelector('input[type="hidden"][name="' + name + '"]');
      if (input) input.value = value;
    }

    function setSubmitting(on) {
      inFlight = on;
      if (!submit) return;
      if (on) {
        submit.setAttribute('aria-disabled', 'true');
        submit.setAttribute('data-submitting', 'true');
        submit.textContent = SENDING_LABEL;
        form.setAttribute('aria-busy', 'true');
      } else {
        submit.removeAttribute('aria-disabled');
        submit.removeAttribute('data-submitting');
        submit.textContent = submitLabel;
        form.removeAttribute('aria-busy');
      }
      if (submitLive) submitLive.textContent = on ? SENDING_LABEL : '';
    }

    form.addEventListener('submit', function (event) {
      if (inFlight) {
        event.preventDefault();
        return;
      }
      submitAttempted = true;
      var v = values();
      var found = validate(v);
      if (Object.keys(found).length) {
        event.preventDefault();
        showAllErrors(found);
        return;
      }
      showAllErrors({});

      if (honeypot && honeypot.value && isAutofilled(honeypot)) honeypot.value = '';

      var fullName = v.fullName.trim();
      var email = v.email.trim();
      var reference = generateReference();
      setPayload('Full name', fullName);
      setPayload('email', email);
      setPayload('_replyto', email);
      setPayload('Phone', v.phone.trim() || NOT_PROVIDED);
      setPayload('Business/organization', v.organization.trim() || NOT_PROVIDED);
      setPayload('Message', v.message.trim() || NOT_PROVIDED);
      setPayload('Request ID', reference);
      setPayload('Submitted', formatSubmitted(new Date(), config.ownerTimeZone));
      setPayload('_autoresponse', String(config.autoresponse || '').split('{name}').join(fullName).split('{reference}').join(reference));

      setSubmitting(true);
      // The browser now posts the form to FormSubmit.
    });

    // Coming back with the Back button restores the page from cache: make the form usable again.
    win.addEventListener('pageshow', function (event) {
      if (event.persisted) setSubmitting(false);
    });

    updateCount();
    if (submit) submit.disabled = false;
  }

  return {
    init: init,
    validate: validate,
    generateReference: generateReference,
    formatSubmitted: formatSubmitted,
    FIELD_ORDER: FIELD_ORDER,
    ERROR_SUMMARY_HEADING: ERROR_SUMMARY_HEADING,
    SENDING_LABEL: SENDING_LABEL,
    NOT_PROVIDED: NOT_PROVIDED,
  };
});
