export const glossary = [
  { term: "3-bet", aliases: "three-bet reraise", definition: "A re-raise after the first raise. Preflop, the big blind counts as the first bet, the open is the second, and the re-raise is the 3-bet." },
  { term: "4-bet", aliases: "four-bet shove jam", definition: "A re-raise over a 3-bet. A 4-bet shove puts the player's remaining stack in." },
  { term: "Big blind (bb)", aliases: "big blinds stakes", definition: "The larger forced blind. It is also a unit for comparing pots, stack sizes, and EV across stakes." },
  { term: "Blocker", aliases: "blockers card removal combos", definition: "A card you can see that rules out some combinations your opponent could hold. For example, holding A♠ rules out every possible A♠ flush in their range." },
  { term: "Bluff-catcher", aliases: "bluff catching bluff-catch underbluff", definition: "A hand that typically beats the opponent's bluffs and loses to the hands they bet for value." },
  { term: "Combo", aliases: "combinations range", definition: "One specific two-card holding. A♠ K♠ and A♥ K♥ are two different combos of AK suited." },
  { term: "Effective stack", aliases: "stack depth", definition: "The maximum amount two players can wager against each other. Heads-up, it is the smaller of their stacks before either puts money in." },
  { term: "Equity", aliases: "showdown split pot", definition: "Your expected share of the pot at showdown against the hands or ranges you specify. In a heads-up pot, it includes half the probability of a tie." },
  { term: "Equity realization", aliases: "realized equity raw equity", definition: "How much of your showdown equity you turn into value through actual play. Position and future betting affect how much you realize." },
  { term: "Expected value (EV)", aliases: "expected value chip ev cev +ev -ev profit", definition: "The average gain or loss from a decision under the same assumptions. When comparing a call with a fold, money already in the pot is sunk and folding is the 0 bb baseline." },
  { term: "Exploitative adjustment", aliases: "exploit exploitation underbluff overbluff", definition: "Changing your play to profit from an opponent's tendencies. Folding more bluff-catchers can gain EV when your opponent rarely bluffs in that spot." },
  { term: "Game theory optimal (GTO)", aliases: "game-theory optimal solver equilibrium balanced", definition: "In poker, a strategy from a Nash equilibrium for a specified game model. A solver's answer depends on assumptions such as the available bet sizes and starting ranges." },
  { term: "Implied odds", aliases: "implied reverse implied future streets draw", definition: "The extra money you expect to win on later streets when you improve. Reverse implied odds are future losses you can incur when you make a strong second-best hand." },
  { term: "Mixed strategy", aliases: "mix frequency randomization", definition: "Using more than one action with the same holding in the same spot, each at a specified frequency." },
  { term: "Nash equilibrium", aliases: "game theory gto equilibrium best response", definition: "A set of strategies where no player can improve their EV by changing their strategy alone while everyone else keeps theirs fixed." },
  { term: "Position", aliases: "in position ip out of position oop button cutoff btn co", definition: "When you act relative to your opponents. Acting last postflop gives you information about what the other players did before you decide." },
  { term: "Pot odds", aliases: "price break-even breakeven call equity required", definition: "The price of a call. When the call closes the betting, the break-even equity is the call amount divided by the final pot after your call, before any additional rake." },
  { term: "Range", aliases: "ranges opponent hands combos weights", definition: "The possible holdings a player can have, with weights that reflect how often each holding reaches the spot given the actions so far." },
  { term: "Stack-to-pot ratio (SPR)", aliases: "stack to pot ratio effective stack", definition: "The effective stack remaining divided by the current pot. It describes how much is left to wager relative to the money already in the middle." },
  { term: "Value bet", aliases: "thin value worse hands call", definition: "A bet that aims to get called by worse hands. For thin value, the advantage against the hands that call is small." },
];

export type KnowledgeQuestion = {
  prompt: string;
  answers: { label: string; explanation: string }[];
  correct: number;
};

export const bluffCatchQuestion: KnowledgeQuestion = {
  prompt: "If the big blind almost never bluffs this river and every value bet beats you, what changes?",
  answers: [
    { label: "Call more often", explanation: "Your call wins less often when bluffs disappear, so its expected value falls." },
    { label: "Fold more often", explanation: "Your break-even price stays the same. Your equity falls when the opponent replaces bluffs with hands that beat you." },
    { label: "Keep calling at the same frequency", explanation: "The same price can justify different decisions against different ranges. Against this range, fewer calls make sense." },
  ],
  correct: 1,
};

export const valueBetQuestion: KnowledgeQuestion = {
  prompt: "You have a set on the river. What is the first question to ask before betting for value?",
  answers: [
    { label: "Which worse hands call this size?", explanation: "Start with plausible calls from worse hands, then account for better hands and possible raises before picking a size." },
    { label: "Which better hands can I make fold?", explanation: "Making better hands fold is a reason to bluff. For value, look for worse hands that can pay you." },
    { label: "Did my hand win at showdown?", explanation: "Judge the bet against the range you expected to face before showdown. One revealed hand cannot establish how often worse hands call." },
  ],
  correct: 0,
};
