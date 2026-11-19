import { describe, expect, it } from 'vitest';
import { Cooldown } from '../../src/logic/cooldown.ts';

describe('Cooldown', () => {
	it('is ready before it has ever triggered', () => {
		expect(new Cooldown(500).ready(0)).toBe(true);
	});

	it('is not ready until the interval has passed', () => {
		const cooldown = new Cooldown(500);
		cooldown.trigger(1000);
		expect(cooldown.ready(1500)).toBe(false);
		expect(cooldown.ready(1501)).toBe(true);
	});

	it('can trigger with a one-off interval', () => {
		const cooldown = new Cooldown(500);
		cooldown.trigger(0, 2500);
		expect(cooldown.ready(2000)).toBe(false);
		expect(cooldown.ready(2501)).toBe(true);
	});
});
