import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, reveal, startVoting, vote } from './helpers';

test.describe('Decks', () => {
  const CASES: { deck: string; cards: string[] }[] = [
    { deck: 'Fibonacci', cards: ['1', '2', '3', '5', '8', '13', '21'] },
    { deck: 'Modified Fibonacci', cards: ['0', '½', '1', '2', '3', '5', '8', '13', '21'] },
    { deck: 'Sequential', cards: ['1', '2', '3', '4', '5', '6', '7', '8'] },
    { deck: 'T-Shirt', cards: ['XS', 'S', 'M', 'L', 'XL'] },
    { deck: 'Powers of 2', cards: ['1', '2', '4', '8', '16', '32'] },
  ];

  for (const { deck, cards } of CASES) {
    test(`renders the ${deck} deck with exactly its cards`, async ({ browser }) => {
      const host = await createRoom(browser, 'Ada', { deck });
      try {
        for (const value of cards) {
          await expect(host.page.getByRole('button', { name: `Vote ${value}`, exact: true })).toBeVisible();
        }
        await expect(host.page.getByLabel('Voting deck').getByRole('button')).toHaveCount(cards.length);
      } finally {
        await host.context.close();
      }
    });
  }

  test('a T-Shirt round reveals mode + distribution without a numeric average', async ({ browser }) => {
    const host = await createRoom(browser, 'Ada', { deck: 'T-Shirt' });
    const rahul = await joinRoom(browser, host.page.url(), 'Rahul');
    try {
      await startVoting(host.page);
      await vote(host.page, 'M');
      await vote(rahul.page, 'M');
      await reveal(host.page);

      await expect(host.page.getByText('Most selected')).toBeVisible();
      // T-Shirt decks deliberately have no numeric average/median/range.
      await expect(host.page.getByText('N/A')).toHaveCount(2);
      await expect(host.page.getByLabel('Revealed votes').getByText('M')).toHaveCount(2);
      await expect(host.page.getByRole('heading', { name: 'Full Consensus' })).toBeVisible();
    } finally {
      await host.context.close();
      await rahul.context.close();
    }
  });
});
