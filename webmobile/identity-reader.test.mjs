import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseIdentityQr, parseIdentityOcr, normalizeIdentityName, validateTenantIdentity, identityImagesAgree } from '../src/shared/tenant-identity.ts'

const qr = '001200000123||Nguyễn Thị Ánh|01012000|Nữ|Hà Nội|01012025||||'
test('CCCD QR preserves Vietnamese accents and NFC', () => {
  const parsed = parseIdentityQr(qr.normalize('NFD'))
  assert.equal(parsed.fullName, 'Nguyễn Thị Ánh')
  assert.equal(parsed.identityCard, '001200000123')
  assert.equal(parsed.birthDate, '2000-01-01')
  assert.equal(parsed.issuedDate, '2025-01-01')
  assert.equal(normalizeIdentityName('  Đỗ  Mỹ   Duyên  '), 'Đỗ Mỹ Duyên')
})
test('unknown QR, invalid numbers, replacement characters and invalid dates are rejected', () => {
  for (const invalid of ['https://example.org', qr.replace('001200000123','1234'), qr.replace('01012000','31022000'), qr.replace('Nguyễn','Nguy�n'), '']) assert.equal(parseIdentityQr(invalid), null)
})
test('OCR extracts printed name only and does not restore accents from MRZ', () => {
  assert.deepEqual(parseIdentityOcr('Số CCCD\n001200000123\nHọ và tên / Full name\nĐỖ MỸ DUYÊN ˆ\nNgày sinh'), { fullName:'ĐỖ MỸ DUYÊN', identityCard:'001200000123' })
  assert.equal(parseIdentityOcr('D0<<MY<DUYEN<<<<').fullName, undefined)
  assert.equal(parseIdentityOcr('Ngày sinh 01012000').identityCard, undefined)
})
test('conflicting front/back identity numbers cannot be accepted', () => {
  assert.equal(identityImagesAgree([{ok:true,fields:{identityCard:'001200000123'}},{ok:true,fields:{identityCard:'001200000124'}}]),false)
  assert.equal(identityImagesAgree([{ok:false},{ok:true,fields:{identityCard:'001200000123'}}]),true)
})
test('save validation rejects blank names and malformed identity number', () => {
  assert.ok(validateTenantIdentity('', '001200000123'))
  assert.ok(validateTenantIdentity('Nguyễn An', '1234'))
  assert.equal(validateTenantIdentity('Nguyễn An', '001200000123'),null)
  assert.equal(validateTenantIdentity('Nguyễn An', '001234567'),null)
})
