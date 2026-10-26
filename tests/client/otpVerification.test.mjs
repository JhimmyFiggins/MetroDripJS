import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pendingOtpChallenge,
  parseCustomerPath,
  safeCustomerPath,
} from '../../web/customer/contracts.js';

test('pendingOtpChallenge extracts challenge metadata for email verification', () => {
  const challenge = pendingOtpChallenge({
    otp_required: true,
    challenge_id: 'chall_reg_123',
    purpose: 'email_verification',
    masked_email: 'j***@example.com',
    code_length: 6,
    resend_after: 60,
  });

  assert.notEqual(challenge, null);
  assert.equal(challenge.challengeId, 'chall_reg_123');
  assert.equal(challenge.purpose, 'email_verification');
  assert.equal(challenge.maskedEmail, 'j***@example.com');
  assert.equal(challenge.codeLength, 6);
  assert.equal(challenge.resendAfter, 60);
});

test('pendingOtpChallenge extracts challenge metadata for login 2FA', () => {
  const challenge = pendingOtpChallenge({
    otp_required: true,
    challenge_id: 'chall_login_456',
    purpose: 'login_2fa',
    masked_email: 'c***@metrodrip.ph',
    code_length: 6,
    resend_after: 45,
  });

  assert.notEqual(challenge, null);
  assert.equal(challenge.challengeId, 'chall_login_456');
  assert.equal(challenge.purpose, 'login_2fa');
  assert.equal(challenge.maskedEmail, 'c***@metrodrip.ph');
  assert.equal(challenge.codeLength, 6);
  assert.equal(challenge.resendAfter, 45);
});

test('pendingOtpChallenge defaults missing length to 6 and resend to 60', () => {
  const challenge = pendingOtpChallenge({
    otp_required: true,
    challenge_id: 'chall_default_789',
  });

  assert.notEqual(challenge, null);
  assert.equal(challenge.challengeId, 'chall_default_789');
  assert.equal(challenge.codeLength, 6);
  assert.equal(challenge.resendAfter, 60);
  assert.equal(challenge.maskedEmail, 'your email');
});

test('pendingOtpChallenge returns null when challenge_id is missing or otp is not required', () => {
  assert.equal(pendingOtpChallenge({ otp_required: false, challenge_id: '123' }), null);
  assert.equal(pendingOtpChallenge({ otp_required: true }), null);
  assert.equal(pendingOtpChallenge({ access_token: 'valid-token' }), null);
  assert.equal(pendingOtpChallenge(null), null);
  assert.equal(pendingOtpChallenge(undefined), null);
});

test('verify-otp customer route is recognized and parsed correctly', () => {
  const route = parseCustomerPath('/customer/verify-otp');
  assert.equal(route.name, 'verify-otp');
});

test('safeCustomerPath preserves safe next redirect after 2FA login', () => {
  assert.equal(safeCustomerPath('/customer/account'), '/customer/account');
  assert.equal(safeCustomerPath('/customer/cart'), '/customer/cart');
  assert.equal(safeCustomerPath('/customer/orders/12'), '/customer/orders/12');
  assert.equal(safeCustomerPath('https://malicious.site/phish'), '/customer/');
  assert.equal(safeCustomerPath('/admin/dashboard'), '/customer/');
});

test('OTP input sanitization helper strips non-digits and truncates to length', () => {
  const sanitize = (raw, length = 6) => raw.replace(/\D/g, '').slice(0, length);

  assert.equal(sanitize('123456'), '123456');
  assert.equal(sanitize('12-34-56'), '123456');
  assert.equal(sanitize('abc 987 xyz 654'), '987654');
  assert.equal(sanitize('1234567890'), '123456');
  assert.equal(sanitize(''), '');
  assert.equal(sanitize('letters only'), '');
});

test('OTP completeness validator enables submit only when exact length is entered', () => {
  const isComplete = (digits, targetLength = 6) => digits.join('').length === targetLength;

  assert.equal(isComplete(['', '', '', '', '', '']), false);
  assert.equal(isComplete(['1', '2', '3', '', '', '']), false);
  assert.equal(isComplete(['1', '2', '3', '4', '5', '']), false);
  assert.equal(isComplete(['1', '2', '3', '4', '5', '6']), true);
  assert.equal(isComplete(['1', '2', '3', '4', '5', '6', '7']), false);
});

test('cooldown timer correctly decrements and clamps at zero', () => {
  let cooldown = 3;
  const tick = () => { cooldown = Math.max(0, cooldown - 1); };

  tick();
  assert.equal(cooldown, 2);
  tick();
  assert.equal(cooldown, 1);
  tick();
  assert.equal(cooldown, 0);
  tick();
  assert.equal(cooldown, 0);
});
