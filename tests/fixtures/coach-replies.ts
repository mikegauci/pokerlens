/**
 * Hand-written coach replies for the sample hands, in the format the prompt asks for.
 * `grounded` uses only numbers from that hand's fact sheet (some rounded), plus cards, hand classes
 * and poker vocabulary that contain digits. Each `invented` reply breaks the rule in one way and
 * names the quantity the checker must report.
 */
export interface RecordedReply {
  grounded: string;
  invented: { why: string; reply: string; flagged: string[] }[];
}

export const COACH_REPLIES: Record<string, RecordedReply> = {
  "river-lead": {
    grounded: `Folding the river was the costly decision; everything before it was standard.

**Biggest leak**: #4, river fold. You needed 29% equity to call 16bb into 38.5bb and had 55% against the assumed BB defend range, so calling was worth about +14.2bb. AJs is second pair on Js 8d 3c 5h Kd, and the BB's range still holds plenty of Jx, 8x and missed draws that lead this card. Call.

**Street by street**: The flop bet of 2bb (36% of pot) with top pair at SPR 17.7 was a fine value bet. The turn bet of 6.5bb, 68% of pot with 90% equity, was also right. Against a player who rarely bluffs the fold gets closer, so that is the read that would change the answer.

**Takeaway**: On the river, write down the equity needed before deciding, then compare it with your read of the range.`,
    invented: [
      {
        why: "a margin the coach computed itself",
        flagged: ["26%"],
        reply: "You had 55% equity against 29% needed, a 26% margin, so this is an easy call.",
      },
      {
        why: "pot odds restated as a ratio",
        flagged: ["38.5:16"],
        reply: "You were getting 38.5:16 on the call with 55% equity.",
      },
      {
        why: "more precision than the engine gave",
        flagged: ["55.4%"],
        reply: "With 55.4% equity against the BB range, folding is a clear mistake.",
      },
    ],
  },

  "kjo-3bet-pot": {
    grounded: `Two mistakes: a loose call of the 3-bet preflop and a hero call on the river.

**Biggest leak**: #8, the river call. You needed 33% equity to call 67.5bb and had 9% against MrThreeBet's narrowed 3-bet range, about 19 combos. The call lost about 50bb. When a 3-bettor barrels three streets and jams, KJ with top pair is a bluff-catcher that beats almost nothing he gets there with. Fold.

**Street by street**: Preflop, calling 5.5bb with KJo out of position is a fold per the CO-versus-3-bet chart, even though the raw numbers (34% vs 31% needed, +0.5bb) look close. The flop call of 5.5bb with 63% equity was good. The turn call of 19bb with 37% against 29% needed was fine.

**Takeaway**: Drill the CO versus BTN 3-bet chart until KJo is an automatic fold.`,
    invented: [
      {
        why: "a range share the engine never stated",
        flagged: ["12%"],
        reply: "His 3-bet range is only about 12% of hands, so KJo is dominated.",
      },
      {
        why: "an EV in big blinds that is not on the sheet",
        flagged: ["35bb"],
        reply: "The river call lost about 50bb, and the whole hand cost you around 35bb in expectation.",
      },
    ],
  },

  "flush-draw-price": {
    grounded: `The turn call was loose; the rest of the hand was played well.

**Biggest leak**: #5, the turn call. You needed 32% equity to call 8bb into 17.1bb and had 22% with the 7-high flush draw, so the call loses about 2.4bb on direct odds. It is an inaccuracy rather than a mistake because a flush can still win more on the river, but those implied odds are thin out of position.

**Street by street**: Calling 1.5bb preflop with 76s in the BB was fine (+0.7bb), though the chart prefers a raise. The flop call of 1.8bb with 40% equity against 20% needed was clearly right. The river fold with 0% equity was correct.

**Takeaway**: Count the price before calling a turn bet with a draw, and only call when implied odds cover the gap.`,
    invented: [
      {
        why: "an outs count and a rule-of-two equity",
        flagged: ["9", "18%"],
        reply: "With 9 outs you have about 18% to hit on the river.",
      },
      {
        why: "an implied-odds amount the engine did not compute",
        flagged: ["11bb"],
        reply: "You would need to win about 11bb more on the river to make the turn call break even.",
      },
    ],
  },

  "missed-value": {
    grounded: `You played the set well until the river check.

**Biggest leak**: #4, the river check with a set of 9s. Your equity against the BB's remaining range was 100%, and calls_a_lot had already called 1.8bb and 6bb. A bet into the 21.1bb pot gets called by plenty of Kx and 6x.

**Street by street**: The flop bet of 33% of pot and the turn bet of 66% of pot were correct value bets with 95% and 97% equity.

**Takeaway**: When the river is a blank and you are ahead of everything, bet; checking back only wins when the opponent bluffs, and this one does not.`,
    invented: [
      {
        why: "a recommended size in big blinds",
        flagged: ["14bb"],
        reply: "Bet around 14bb on the river; he calls with any king.",
      },
      {
        why: "a recommended size as a fraction of pot",
        flagged: ["75%"],
        reply: "A 75% pot bet on the river gets called by Kx.",
      },
    ],
  },

  "jj-vs-jam": {
    grounded: `The 3-bet was right; calling the 100bb jam was the mistake.

**Biggest leak**: #2, calling 89bb with JJ. Against a CO 4-bet range of QQ+, AKs, AKo and A5s (38 combos), JJ has 39% equity and needed 44%, so the call lost about 9.8bb. This is an all-in, so the comparison is exact for that range.

**Street by street**: The 3-bet to 11bb from the SB was standard; the chart recommends a raise and JJ had 67% against the CO open range.

**Takeaway**: Before you 3-bet, decide what you do against a 4-bet jam, and fold JJ when the 4-bet range is this tight.`,
    invented: [
      {
        why: "a frequency the 4-bettor supposedly bluffs",
        flagged: ["10%"],
        reply: "He only needs to be bluffing with A5s about 10% of the time for this to be close.",
      },
      {
        why: "a three-to-one ratio",
        flagged: ["3-to-1"],
        reply: "Against KK you are roughly 3-to-1 behind, which is why the call loses.",
      },
    ],
  },

  "mtt-short-stack": {
    grounded: `A good call: KQs has enough equity against a short-stack reshove.

**Biggest leak**: None. The call of 9.6bb into 14.9bb needed 39% equity and KQs had 53% against the reshove range, worth about +3.2bb.

**Street by street**: The 2bb open on the BTN with 31bb was standard. The reshove range comes from a push/fold equilibrium at 11.8bb effective, an approximation: it assumes chip EV, no ICM, and that only the opener can call.

**Takeaway**: When short, learn which hands call a reshove by price alone.`,
    invented: [
      {
        why: "an ICM adjustment the engine does not model",
        flagged: ["5%"],
        reply: "With ICM you would need about 5% more equity, but the call is still fine.",
      },
      {
        why: "a stack size that is not on the sheet",
        flagged: ["25bb"],
        reply: "At 25bb this would be a clear fold.",
      },
    ],
  },
};
