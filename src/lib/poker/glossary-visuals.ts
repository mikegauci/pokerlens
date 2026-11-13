type VisualItem =
  | { kind: "cards"; label: string; cards: string }
  | { kind: "chips"; label: string; amount: string }
  | { kind: "metric"; label: string; value: string; tone: "mint" | "amber" | "sky" | "muted" }
  | { kind: "grid"; label: string; selected: string[] };

export type GlossaryFrame = {
  items: VisualItem[];
  caption: string;
};

const cards = (label: string, hand: string): VisualItem => ({ kind: "cards", label, cards: hand });
const chips = (label: string, amount: string): VisualItem => ({ kind: "chips", label, amount });
const metric = (label: string, value: string, tone: "mint" | "amber" | "sky" | "muted" = "mint"): VisualItem =>
  ({ kind: "metric", label, value, tone });
const grid = (label: string, selected: string[]): VisualItem => ({ kind: "grid", label, selected });

export const glossaryVisuals = {
  "three-bet": [
    { items: [chips("Big blind", "1 bb"), chips("Open", "2.5 bb")], caption: "The big blind is the first bet. The opening raise to 2.5 bb is the second." },
    { items: [chips("Open", "2.5 bb"), chips("3-bet", "8 bb")], caption: "The next player raises the total to 8 bb. This first re-raise is the 3-bet." },
  ],
  "four-bet": [
    { items: [chips("Open", "2.5 bb"), chips("3-bet", "8 bb")], caption: "The button re-raises the opener from 2.5 bb to 8 bb." },
    { items: [chips("3-bet", "8 bb"), chips("4-bet", "22 bb")], caption: "The opener raises again to 22 bb. A 4-bet shove would put their full stack in." },
  ],
  "big-blind": [
    { items: [chips("Small blind", "$1"), chips("Big blind", "$2")], caption: "At a $1/$2 table, the big blind posts $2 before any voluntary action." },
    { items: [chips("Stack", "$200"), metric("In big blinds", "100 bb")], caption: "Divide your $200 stack by the $2 big blind to get 100 bb." },
  ],
  blocker: [
    { items: [cards("Board", "Js 8s 3s"), cards("Possible flush", "As Ks")], caption: "On this three-spade flop, A♠ K♠ is one possible opponent flush." },
    { items: [cards("Your hand", "As Qh"), metric("A♠ K♠", "Blocked", "amber")], caption: "Your A♠ removes that combo and every other flush combo containing A♠ from the opponent's range." },
  ],
  "bluff-catcher": [
    { items: [cards("Your hand", "Js Jh"), cards("Their bluff", "Qs Ts")], caption: "On K♦ 8♣ 6♥ 4♠ 2♦, your jacks beat a bluff with queen-high." },
    { items: [cards("Your hand", "Js Jh"), cards("Their value", "Ks Qh")], caption: "On the same board, the jacks lose to top pair. How often the bettor bluffs drives the call." },
  ],
  combo: [
    { items: [cards("One AKs combo", "As Ks")], caption: "A♠ K♠ is one specific combination of ace-king suited." },
    { items: [cards("Spades", "As Ks"), cards("Hearts", "Ah Kh")], caption: "A♥ K♥ is a different combo of the same hand class. AKs has four combos before card removal." },
  ],
  "effective-stack": [
    { items: [chips("Your stack", "100 bb"), chips("Their stack", "60 bb")], caption: "You start a heads-up hand with 100 bb. Your opponent starts with 60 bb." },
    { items: [chips("Effective stack", "60 bb"), metric("Unmatched", "40 bb", "muted")], caption: "Only 60 bb per player can go into the pot against each other. Your extra 40 bb stays outside the wager." },
  ],
  equity: [
    { items: [metric("Win outright", "40%"), metric("Tie", "10%", "sky")], caption: "In this heads-up example, you win outright 40% of the time and split the pot 10% of the time." },
    { items: [metric("40% + half of 10%", "45% equity")], caption: "A tie gives you half the pot. Adding that share makes your showdown equity 45%." },
  ],
  "equity-realization": [
    { items: [chips("Current pot", "20 bb"), metric("Showdown equity", "40%", "sky")], caption: "If this pot always checked down, 40% equity would be worth 8 bb on average." },
    { items: [metric("Facing a turn bet", "You fold", "amber"), chips("Pot share this time", "0 bb")], caption: "Folding to a bet gives up your share on this line. Over many hands, future betting affects how much showdown equity you turn into value." },
  ],
  ev: [
    { items: [metric("25% equity", "−2.4 bb", "amber"), metric("Fold EV", "0 bb", "muted")], caption: "It costs 16 bb to call with 38.5 bb already in the pot. At 25% equity, calling loses 2.4 bb on average relative to folding." },
    { items: [metric("40% equity", "+5.8 bb"), metric("Fold EV", "0 bb", "muted")], caption: "At the same price, 40% equity makes the call worth 5.8 bb before rake. Each hand can still win or lose." },
  ],
  exploit: [
    { items: [metric("Break-even equity", "25%", "sky"), metric("Estimated bluffs", "35%")], caption: "Against a half-pot river bet, a pure bluff-catcher needs 25% equity. If bluffs make up 35% of bets, it can call profitably." },
    { items: [metric("Break-even equity", "25%", "sky"), metric("Estimated bluffs", "10%", "amber")], caption: "Against a player who bluffs only 10% here, fold the same hand. The price stayed fixed while the opponent's betting range changed." },
  ],
  gto: [
    { items: [chips("River pot", "10 bb"), chips("Bet size", "5 bb")], caption: "In a simplified river game, the bettor uses one size and bets with hands that always win or bluffs that always lose when called." },
    { items: [metric("Value bets", "75%"), metric("Bluffs", "25%", "sky")], caption: "This mix gives a pure bluff-catcher 25% equity, exactly its break-even price. The equilibrium mix depends on the game model and the bet size." },
  ],
  "implied-odds": [
    { items: [cards("Your draw", "7h 6h"), chips("Turn call", "8 bb")], caption: "With a flush draw on the turn, start by comparing your equity with the immediate price of the call." },
    { items: [cards("River", "4h"), chips("Possible extra call", "12 bb")], caption: "If the flush hits and a worse hand pays off a 12 bb river bet, that extra payment adds implied value. It depends on how often the opponent pays." },
  ],
  "mixed-strategy": [
    { items: [cards("Same hand", "Ks Kh"), metric("Call", "70%"), metric("Raise", "30%", "sky")], caption: "In this illustrative strategy, the same K♠ K♥ combo can take either action in the same spot." },
    { items: [metric("Random draw 1–70", "Call"), metric("Random draw 71–100", "Raise", "sky")], caption: "A uniform draw from 1 to 100 is one way to implement the 70% call and 30% raise mix." },
  ],
  nash: [
    { items: [metric("Bettor", "25% bluffs", "sky"), metric("Defender", "⅔ calls")], caption: "In a simplified half-pot river game with pure value hands and zero-equity bluffs, these frequencies make the other player's marginal action break even." },
    { items: [metric("Bluff vs. give up", "0 bb extra"), metric("Call vs. fold", "0 bb extra")], caption: "With the other player's strategy fixed, a bluff gains nothing over giving up and a bluff-catcher gains nothing by switching from fold to call. This illustrates mutual best responses." },
  ],
  position: [
    { items: [metric("Big blind", "Acts first", "amber"), metric("Button", "Acts last")], caption: "Heads-up postflop in this hand, the big blind acts before the button." },
    { items: [metric("Big blind", "Checks", "muted"), metric("Button", "Can bet or check")], caption: "The button sees the check before choosing an action. That extra information is one advantage of position." },
  ],
  "pot-odds": [
    { items: [chips("Pot after their bet", "15 bb"), chips("To call", "5 bb")], caption: "The opponent bets 5 bb into 10 bb. There are 15 bb in the middle when you decide." },
    { items: [chips("Pot after your call", "20 bb"), metric("5 ÷ 20", "25% equity")], caption: "Your 5 bb call would make a 20 bb pot. You need 25% equity to break even before rake if the call closes the action." },
  ],
  range: [
    { items: [grid("Illustrative starting range", ["AA", "AKs", "AQs", "AJs", "AKo", "KK", "KQs", "AQo", "QQ", "JJ"])], caption: "This A-to-J excerpt of a preflop grid highlights several hand classes an opponent could start with." },
    { items: [grid("Possible 4-bet range", ["AA", "AKs", "AKo", "KK"])], caption: "After a 4-bet, you might give fewer hand classes meaningful weight. The highlighted hands are one illustrative read." },
  ],
  spr: [
    { items: [chips("Effective stack left", "80 bb"), chips("Pot", "20 bb"), metric("SPR", "4")], caption: "An 80 bb effective stack and a 20 bb pot give a stack-to-pot ratio of 4." },
    { items: [chips("Effective stack left", "60 bb"), chips("Pot", "60 bb"), metric("SPR", "1")], caption: "After a 20 bb bet and call, 60 bb remains per player and the pot is 60 bb. One pot-sized bet can now put the effective stack in." },
  ],
  "value-bet": [
    { items: [cards("Your set", "9c 9d"), cards("Their top pair", "Kd Ts")], caption: "On K♣ 9♥ 6♠ 3♥ 2♦, your set can target worse hands such as K♦ T♠." },
    { items: [chips("You bet", "8 bb"), chips("Worse hand calls", "8 bb")], caption: "When top pair calls, you win an extra 8 bb compared with checking. To choose a size, consider what worse hands will call and what stronger hands might raise." },
  ],
} satisfies Record<string, readonly [GlossaryFrame, GlossaryFrame, ...GlossaryFrame[]]>;

export type GlossaryVisualId = keyof typeof glossaryVisuals;
