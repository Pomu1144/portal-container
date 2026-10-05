/* js/bridge.js — hub side of the Portal protocol (see sdk/portal-sdk.js).
 * Opens one game at a time in an iframe and answers its messages. Rules:
 *   - only messages from that iframe, from the game's own origin, are read
 *   - a game only receives the party the player picked (max 5 cards)
 *   - updates are accepted only for cards in that party; level/rarity only rise
 *   - a game may only grant characters it owns (card.sourceGame === game id)
 *   - a game deposits and withdraws only its own two currencies, held at the
 *     Portal as '<game>:coins' and '<game>:premium' (see js/bank.js); each
 *     txId is applied once
 */
(function (global) {
  'use strict';

  const SDK = global.PortalSDK;
  const MAX_GRANTS_PER_TRIP = 50;
  let trip = null; // { game, origin, frame, party, grants, onEvent }

  // This game's two currencies as held at the Portal.
  function walletFor(game) {
    return { coins: Bank.bal(game.id + ':coins'), premium: Bank.bal(game.id + ':premium') };
  }

  function gameOrigin(game) {
    return new URL(game.url, global.location.href).origin;
  }

  function reply(msg) {
    if (!trip || !trip.frame.contentWindow) return;
    trip.frame.contentWindow.postMessage(Object.assign({ ns: SDK.NS, v: SDK.VERSION }, msg), trip.origin);
  }

  function onMessage(e) {
    if (!trip || e.source !== trip.frame.contentWindow || e.origin !== trip.origin) return;
    const m = e.data;
    if (!m || m.ns !== SDK.NS || m.v !== SDK.VERSION) return;
    const ack = (ok, error) => reply({ type: 'ack', reqId: m.reqId, ok, error });

    switch (m.type) {
      case 'hello':
        if (m.gameId !== trip.game.id) return;
        // Every page the game loads says hello; each gets the same party.
        reply({
          type: 'welcome',
          player: { name: Vault.playerName() || 'Player' },
          party: { id: trip.party.id, max: SDK.MAX_PARTY, cards: trip.party.cards },
          wallet: walletFor(trip.game),
          rates: { coins: 1, premium: 1 },
        });
        trip.onEvent('connected');
        break;

      case 'update': {
        if (m.partyId !== trip.party.id) return ack(false, 'Unknown party');
        const card = trip.party.cards.find((c) => c.id === m.cardId);
        if (!card) return ack(false, 'Card is not in this party');
        const updated = Vault.patch(card.id, m.patch || {});
        if (!updated) return ack(false, 'Card is no longer in the vault');
        Object.assign(card, { level: updated.level, rarity: updated.rarity });
        trip.onEvent('update', updated);
        return ack(true);
      }

      case 'grant': {
        if (trip.grants >= MAX_GRANTS_PER_TRIP) return ack(false, 'Too many grants this trip');
        let card;
        try { card = SDK.validateCard(m.card); } catch (err) { return ack(false, err.message); }
        if (card.sourceGame !== trip.game.id) return ack(false, 'A game can only send its own characters');
        trip.grants++;
        const stored = Vault.put(card);
        trip.onEvent('grant', stored);
        return ack(true);
      }

      case 'deposit':
      case 'withdraw': {
        try { SDK.checkTransfer(m.currency, m.amount, m.txId); } catch (err) { return ack(false, err.message); }
        const id = trip.game.id + ':' + m.currency;
        const r = Bank.transfer(trip.game.id + ':' + m.txId, m.type, id, m.amount, { gameId: trip.game.id });
        reply({ type: 'ack', reqId: m.reqId, ok: r.ok, error: r.error, wallet: walletFor(trip.game) });
        if (r.ok && !r.replay) trip.onEvent(m.type, { id, amount: m.amount });
        return;
      }

      case 'exit':
        trip.onEvent('exit');
        break;
    }
  }

  global.addEventListener('message', onMessage);

  global.PortalBridge = {
    /** Start a trip: load the game into `frame` with the chosen party cards. */
    open(game, frame, cards, onEvent) {
      if (cards.length > Math.min(SDK.MAX_PARTY, game.maxParty || SDK.MAX_PARTY)) {
        throw new Error('Party is too large for ' + game.name);
      }
      const party = {
        id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        cards: cards.map((c) => SDK.validateCard(c)),
      };
      trip = { game, origin: gameOrigin(game), frame, party, grants: 0, onEvent: onEvent || (() => {}) };
      frame.src = new URL(game.url, global.location.href).href;
      return party;
    },
    close() {
      if (trip) trip.frame.src = 'about:blank';
      trip = null;
    },
    current: () => trip,
  };
})(window);
