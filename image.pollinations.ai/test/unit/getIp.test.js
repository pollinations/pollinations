import { describe, it, expect } from 'vitest';
import { getIp } from '../../src/getIp.js';

describe('getIp', () => {
  it('should extract IP from x-bb-ip header', () => {
    const req = {
      headers: { 'x-bb-ip': '192.168.1.100' },
      socket: { remoteAddress: '10.0.0.1' }
    };
    expect(getIp(req)).toBe('192.168.1');
  });

  it('should extract IP from x-nf-client-connection-ip header', () => {
    const req = {
      headers: { 'x-nf-client-connection-ip': '192.168.2.100' },
      socket: { remoteAddress: '10.0.0.1' }
    };
    expect(getIp(req)).toBe('192.168.2');
  });

  it('should extract IP from x-real-ip header', () => {
    const req = {
      headers: { 'x-real-ip': '192.168.3.100' },
      socket: { remoteAddress: '10.0.0.1' }
    };
    expect(getIp(req)).toBe('192.168.3');
  });

  it('should extract IP from x-forwarded-for header', () => {
    const req = {
      headers: { 'x-forwarded-for': '192.168.4.100' },
      socket: { remoteAddress: '10.0.0.1' }
    };
    expect(getIp(req)).toBe('192.168.4');
  });

  it('should extract IP from socket remoteAddress if no headers present', () => {
    const req = {
      headers: {},
      socket: { remoteAddress: '10.0.0.1' }
    };
    expect(getIp(req)).toBe('10.0.0');
  });

  it('should return null if no IP address is found', () => {
    const req = {
      headers: {},
      socket: { remoteAddress: null }
    };
    expect(getIp(req)).toBe(null);
  });
});
