import type { Street } from "./parser";

export interface SampleHand {
  id: string;
  title: string;
  blurb: string;
  previewStreet: Street;
  text: string;
}

export const SAMPLES: SampleHand[] = [
  {
    id: "river-lead",
    title: "Second pair facing a river lead",
    previewStreet: "river",
    blurb: "AJs on the button. Villain check-calls twice, then leads the river when a king falls. Try the opponent profiles on this one.",
    text: `PokerStars Hand #250000000001:  Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/02 20:14:33 ET
Table 'Alnitak IV' 6-max Seat #4 is the button
Seat 1: riverrat_88 ($104.50 in chips)
Seat 2: NitNancy ($100 in chips)
Seat 3: c0ldcall ($87.25 in chips)
Seat 4: Hero ($100 in chips)
Seat 5: bluffy_mcb ($121.40 in chips)
Seat 6: TiltedTom ($100 in chips)
bluffy_mcb: posts small blind $0.50
TiltedTom: posts big blind $1
*** HOLE CARDS ***
Dealt to Hero [Ah Jh]
riverrat_88: folds
NitNancy: folds
c0ldcall: folds
Hero: raises $1.50 to $2.50
bluffy_mcb: folds
TiltedTom: calls $1.50
*** FLOP *** [Js 8d 3c]
TiltedTom: checks
Hero: bets $2
TiltedTom: calls $2
*** TURN *** [Js 8d 3c] [5h]
TiltedTom: checks
Hero: bets $6.50
TiltedTom: calls $6.50
*** RIVER *** [Js 8d 3c 5h] [Kd]
TiltedTom: bets $16
Hero: folds
Uncalled bet ($16) returned to TiltedTom
TiltedTom collected $21.50 from pot
*** SUMMARY ***
Total pot $22.50 | Rake $1
Board [Js 8d 3c 5h Kd]`,
  },
  {
    id: "kjo-3bet-pot",
    title: "KJo calls a 3-bet and stacks off",
    previewStreet: "preflop",
    blurb: "A cutoff open gets 3-bet by the button. Top pair looks strong, but the trouble started preflop.",
    text: `PokerStars Hand #250000000002:  Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/03 21:02:10 ET
Table 'Mimosa II' 6-max Seat #5 is the button
Seat 1: bb_defender ($143 in chips)
Seat 2: stackd ($100 in chips)
Seat 3: quietgrinder ($100 in chips)
Seat 4: Hero ($100 in chips)
Seat 5: MrThreeBet ($100 in chips)
Seat 6: sb_sid ($100 in chips)
sb_sid: posts small blind $0.50
bb_defender: posts big blind $1
*** HOLE CARDS ***
Dealt to Hero [Kc Jd]
stackd: folds
quietgrinder: folds
Hero: raises $1.50 to $2.50
MrThreeBet: raises $5.50 to $8
sb_sid: folds
bb_defender: folds
Hero: calls $5.50
*** FLOP *** [Kh 7s 2d]
Hero: checks
MrThreeBet: bets $5.50
Hero: calls $5.50
*** TURN *** [Kh 7s 2d] [9c]
Hero: checks
MrThreeBet: bets $19
Hero: calls $19
*** RIVER *** [Kh 7s 2d 9c] [4s]
Hero: checks
MrThreeBet: bets $67.50 and is all-in
Hero: calls $67.50 and is all-in
*** SHOW DOWN ***
MrThreeBet: shows [Ad Ks] (a pair of Kings)
Hero: shows [Kc Jd] (a pair of Kings)
MrThreeBet collected $198.50 from pot
*** SUMMARY ***
Total pot $201.50 | Rake $3
Board [Kh 7s 2d 9c 4s]`,
  },
  {
    id: "flush-draw-price",
    title: "Flush draw facing a big turn bet",
    previewStreet: "turn",
    blurb: "76 of hearts defends the big blind, flops a flush draw and has to decide whether the turn price is right.",
    text: `PokerStars Hand #250000000003:  Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/04 19:45:51 ET
Table 'Castor III' 6-max Seat #2 is the button
Seat 1: early_bird ($100 in chips)
Seat 2: ButtonMasher ($118.20 in chips)
Seat 3: sb_steve ($100 in chips)
Seat 4: Hero ($100 in chips)
Seat 5: foldy ($95 in chips)
Seat 6: lagtastic ($210.75 in chips)
sb_steve: posts small blind $0.50
Hero: posts big blind $1
*** HOLE CARDS ***
Dealt to Hero [7h 6h]
foldy: folds
lagtastic: folds
early_bird: folds
ButtonMasher: raises $1.50 to $2.50
sb_steve: folds
Hero: calls $1.50
*** FLOP *** [Kh 9h 2c]
Hero: checks
ButtonMasher: bets $1.80
Hero: calls $1.80
*** TURN *** [Kh 9h 2c] [3s]
Hero: checks
ButtonMasher: bets $8
Hero: calls $8
*** RIVER *** [Kh 9h 2c 3s] [2d]
Hero: checks
ButtonMasher: bets $20
Hero: folds
Uncalled bet ($20) returned to ButtonMasher
ButtonMasher collected $24 from pot
*** SUMMARY ***
Total pot $25.10 | Rake $1.10
Board [Kh 9h 2c 3s 2d]`,
  },
  {
    id: "missed-value",
    title: "Middle set checks back the river",
    previewStreet: "river",
    blurb: "Pocket nines flop a set against the big blind, bet twice, then check back a blank river.",
    text: `PokerStars Hand #250000000004:  Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/05 22:31:07 ET
Table 'Deneb V' 6-max Seat #3 is the button
Seat 1: station_stan ($100 in chips)
Seat 2: Hero ($100 in chips)
Seat 3: btn_bob ($100 in chips)
Seat 4: smallblind_sue ($77.50 in chips)
Seat 5: calls_a_lot ($132 in chips)
Seat 6: utg_ursula ($100 in chips)
smallblind_sue: posts small blind $0.50
calls_a_lot: posts big blind $1
*** HOLE CARDS ***
Dealt to Hero [9c 9d]
utg_ursula: folds
station_stan: folds
Hero: raises $1.50 to $2.50
btn_bob: folds
smallblind_sue: folds
calls_a_lot: calls $1.50
*** FLOP *** [9h 6s 2d]
calls_a_lot: checks
Hero: bets $1.80
calls_a_lot: calls $1.80
*** TURN *** [9h 6s 2d] [Kc]
calls_a_lot: checks
Hero: bets $6
calls_a_lot: calls $6
*** RIVER *** [9h 6s 2d Kc] [3h]
calls_a_lot: checks
Hero: checks
*** SHOW DOWN ***
calls_a_lot: shows [Kd Ts] (a pair of Kings)
Hero: shows [9c 9d] (three of a kind, Nines)
Hero collected $20.10 from pot
*** SUMMARY ***
Total pot $21.10 | Rake $1
Board [9h 6s 2d Kc 3h]`,
  },
  {
    id: "jj-vs-jam",
    title: "Jacks call a 4-bet shove",
    previewStreet: "preflop",
    blurb: "JJ 3-bets from the small blind and the cutoff moves all-in. An all-in call is pure maths: equity against price.",
    text: `PokerStars Hand #250000000005:  Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/06 20:58:40 ET
Table 'Electra VI' 6-max Seat #3 is the button
Seat 1: mp_mary ($100 in chips)
Seat 2: TightIsRight ($100 in chips)
Seat 3: btn_bruno ($104 in chips)
Seat 4: Hero ($100 in chips)
Seat 5: bigblind_ben ($100 in chips)
Seat 6: utg_uma ($91.30 in chips)
Hero: posts small blind $0.50
bigblind_ben: posts big blind $1
*** HOLE CARDS ***
Dealt to Hero [Js Jc]
utg_uma: folds
mp_mary: folds
TightIsRight: raises $1.50 to $2.50
btn_bruno: folds
Hero: raises $8.50 to $11
bigblind_ben: folds
TightIsRight: raises $89 to $100 and is all-in
Hero: calls $89 and is all-in
*** FLOP *** [Td 6c 2s]
*** TURN *** [Td 6c 2s] [5h]
*** RIVER *** [Td 6c 2s 5h] [Ac]
*** SHOW DOWN ***
Hero: shows [Js Jc] (a pair of Jacks)
TightIsRight: shows [Kh Kd] (a pair of Kings)
TightIsRight collected $198 from pot
*** SUMMARY ***
Total pot $201 | Rake $3
Board [Td 6c 2s 5h Ac]`,
  },
  {
    id: "mtt-short-stack",
    title: "Tournament: KQs facing a 12bb shove",
    previewStreet: "preflop",
    blurb: "A 100bb 3-bet chart is far too tight for a 12bb shove, so the shover's range comes from a reshove equilibrium instead. Edit the range and watch the verdict change.",
    text: `PokerStars Hand #250000000006: Tournament #3999000111, $10+$1 USD Hold'em No Limit - Level XII (400/800) - 2026/11/08 21:40:12 ET
Table '3999000111 14' 9-max Seat #5 is the button
Seat 1: icm_ian (18250 in chips)
Seat 2: chipleader_cho (61300 in chips)
Seat 4: foldbot (22100 in chips)
Seat 5: Hero (24600 in chips)
Seat 7: sb_sam (15400 in chips)
Seat 9: short_shover (9400 in chips)
icm_ian: posts the ante 100
chipleader_cho: posts the ante 100
foldbot: posts the ante 100
Hero: posts the ante 100
sb_sam: posts the ante 100
short_shover: posts the ante 100
sb_sam: posts small blind 400
short_shover: posts big blind 800
*** HOLE CARDS ***
Dealt to Hero [Kd Qd]
icm_ian: folds
chipleader_cho: folds
foldbot: folds
Hero: raises 800 to 1600
sb_sam: folds
short_shover: raises 7700 to 9300 and is all-in
Hero: calls 7700
*** FLOP *** [Qs 7h 4c]
*** TURN *** [Qs 7h 4c] [2d]
*** RIVER *** [Qs 7h 4c 2d] [9s]
*** SHOW DOWN ***
short_shover: shows [Ah 9c] (a pair of Nines)
Hero: shows [Kd Qd] (a pair of Queens)
Hero collected 19600 from pot
*** SUMMARY ***
Total pot 19600 | Rake 0
Board [Qs 7h 4c 2d 9s]`,
  },
];
