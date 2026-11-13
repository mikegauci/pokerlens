/**
 * The same hand written as PokerStars, GGPoker and 888poker export it. The layouts follow real exports
 * from each site (888poker's from public parser test data); the players and cards are made up.
 *
 * $0.50/$1, four players, Hero on the button with A♥ Q♥. Hero opens, the big blind 3-bets and Hero calls.
 * Hero raises the flop, then bets the turn and the big blind calls all in for less, so $10 goes back to Hero.
 */
export const STARS_HAND = `PokerStars Hand #250000000101:  Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/12 21:05:00 ET
Table 'Kochab II' 6-max Seat #2 is the button
Seat 1: vill_a ($100 in chips)
Seat 2: Hero ($100 in chips)
Seat 3: sb_guy ($80 in chips)
Seat 4: bb_guy ($64 in chips)
sb_guy: posts small blind $0.50
bb_guy: posts big blind $1
*** HOLE CARDS ***
Dealt to Hero [Ah Qh]
vill_a: folds
Hero: raises $1.50 to $2.50
sb_guy: folds
bb_guy: raises $6.50 to $9
Hero: calls $6.50
*** FLOP *** [Kh 9h 4c]
bb_guy: bets $8
Hero: raises $17 to $25
bb_guy: calls $17
*** TURN *** [Kh 9h 4c] [2s]
bb_guy: checks
Hero: bets $40
bb_guy: calls $30 and is all-in
Uncalled bet ($10) returned to Hero
*** RIVER *** [Kh 9h 4c 2s] [7h]
*** SHOW DOWN ***
bb_guy: shows [Kd Kc] (three of a kind, Kings)
Hero: shows [Ah Qh] (a flush, Ace high)
Hero collected $125.50 from pot
*** SUMMARY ***
Total pot $128.50 | Rake $3
Board [Kh 9h 4c 2s 7h]
Seat 2: Hero (button) showed [Ah Qh] and won ($125.50) with a flush, Ace high
Seat 4: bb_guy (big blind) showed [Kd Kc] and lost with three of a kind, Kings`;

/** GGPoker: a letter prefix on the hand id, and a "Dealt to" line for every player with cards only for Hero. */
export const GG_HAND = `Poker Hand #RC2500000101: Hold'em No Limit ($0.50/$1) - 2026/11/12 21:05:00
Table 'RushAndCash100' 6-max Seat #2 is the button
Seat 1: vill_a ($100 in chips)
Seat 2: Hero ($100 in chips)
Seat 3: sb_guy ($80 in chips)
Seat 4: bb_guy ($64 in chips)
sb_guy: posts small blind $0.50
bb_guy: posts big blind $1
*** HOLE CARDS ***
Dealt to vill_a
Dealt to Hero [Ah Qh]
Dealt to sb_guy
Dealt to bb_guy
vill_a: folds
Hero: raises $1.50 to $2.50
sb_guy: folds
bb_guy: raises $6.50 to $9
Hero: calls $6.50
*** FLOP *** [Kh 9h 4c]
bb_guy: bets $8
Hero: raises $17 to $25
bb_guy: calls $17
*** TURN *** [Kh 9h 4c] [2s]
bb_guy: checks
Hero: bets $40
bb_guy: calls $30 and is all-in
Uncalled bet ($10) returned to Hero
*** RIVER *** [Kh 9h 4c 2s] [7h]
*** SHOWDOWN ***
bb_guy: shows [Kd Kc] (Three of a kind, Kings)
Hero: shows [Ah Qh] (a Flush, Ace high)
Hero collected $125.50 from pot
*** SUMMARY ***
Total pot $128.50 | Rake $3 | Jackpot $0 | Bingo $0 | Fortune $0 | Tax $0
Board [Kh 9h 4c 2s 7h]
Seat 2: Hero (button) showed [Ah Qh] and won ($125.50) with a Flush, Ace high
Seat 4: bb_guy (big blind) showed [Kd Kc] and lost with Three of a kind, Kings`;

/**
 * 888poker: a raise is the chips put in by that action, there is no all-in marker and no uncalled-bet line,
 * and cards are written "[ Ah, Qh ]".
 */
export const P888_HAND = `#Game No : 2500000101
***** 888poker Hand History for Game 2500000101 *****
$0.50/$1 Blinds No Limit Holdem - *** 12 11 2026 21:05:00
Table Kochab 6 Max (Real Money)
Seat 2 is the button
Total number of players : 4
Seat 1: vill_a ( $100 )
Seat 2: Hero ( $100 )
Seat 3: sb_guy ( $80 )
Seat 4: bb_guy ( $64 )
sb_guy posts small blind [$0.50]
bb_guy posts big blind [$1]
** Dealing down cards **
Dealt to Hero [ Ah, Qh ]
vill_a folds
Hero raises [$2.50]
sb_guy folds
bb_guy raises [$8]
Hero calls [$6.50]
** Dealing flop ** [ Kh, 9h, 4c ]
bb_guy bets [$8]
Hero raises [$25]
bb_guy calls [$17]
** Dealing turn ** [ 2s ]
bb_guy checks
Hero bets [$40]
bb_guy calls [$30]
** Dealing river ** [ 7h ]
** Summary **
bb_guy shows [ Kd, Kc ]
Hero shows [ Ah, Qh ]
Hero collected [ $125.50 ]`;

/** 888poker tournament with antes and a dead blind; the big blind folds to a raise, so the raise is returned in part. */
export const P888_TOURNAMENT = `#Game No : 778400001
***** 888poker Hand History for Game 778400001 *****
50/100 Blinds No Limit Holdem - *** 02 08 2026 09:31:00
Tournament #293965397 $5 + $1 - Table #3 8 Max (Real Money)
Seat 8 is the button
Total number of players : 5
Seat 1: Hero ( 4,200 )
Seat 2: late_larry ( 3,000 )
Seat 5: opener_ola ( 5,000 )
Seat 8: button_bea ( 6,100 )
Seat 10: blind_bo ( 2,300 )
Hero posts ante [12]
late_larry posts ante [12]
opener_ola posts ante [12]
button_bea posts ante [12]
blind_bo posts ante [12]
blind_bo posts small blind [50]
Hero posts big blind [100]
late_larry posts dead blind [50 + 100]
** Dealing down cards **
Dealt to Hero [ 9c, 9d ]
late_larry checks
opener_ola folds
button_bea raises [250]
blind_bo folds
Hero raises [700]
late_larry folds
button_bea folds
** Summary **
Hero collected [ 760 ]`;

/** GGPoker run-it-twice: both runs are written; the review uses the first. */
export const GG_RUN_IT_TWICE = `Poker Hand #RC2500000102: Hold'em No Limit ($1/$2) - 2026/11/12 22:10:00
Table 'NLH 2' 6-max Seat #1 is the button
Seat 1: Hero ($200 in chips)
Seat 2: shove_sid ($180 in chips)
Seat 3: big_ben ($200 in chips)
shove_sid: posts small blind $1
big_ben: posts big blind $2
*** HOLE CARDS ***
Dealt to Hero [Ac Kc]
Dealt to shove_sid
Dealt to big_ben
Hero: raises $3 to $5
shove_sid: raises $175 to $180 and is all-in
big_ben: folds
Hero: calls $175
*** FIRST FLOP *** [Qs 8d 3c]
*** SECOND FLOP *** [Jh 6h 2d]
*** FIRST TURN *** [Qs 8d 3c] [Ks]
*** SECOND TURN *** [Jh 6h 2d] [5c]
*** FIRST RIVER *** [Qs 8d 3c Ks] [4h]
*** SECOND RIVER *** [Jh 6h 2d 5c] [Td]
*** FIRST SHOWDOWN ***
shove_sid: shows [Jd Jc] (a pair of Jacks)
Hero: shows [Ac Kc] (a pair of Kings)
Hero collected $175.50 from pot
*** SECOND SHOWDOWN ***
shove_sid collected $175.50 from pot
*** SUMMARY ***
Total pot $362 | Rake $11 | Jackpot $0
Board [Qs 8d 3c Ks 4h]`;
