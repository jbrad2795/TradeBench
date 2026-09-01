# TradeBench — site copy drafts

Drafts for JB to edit. Two sections: the pitch, and "The game at a glance".

---

## 1. Hero pitch

Trade negotiation is one of the few arenas where the people making the decision are
least likely to understand the file. Few ministers have a trade background; most are
drawn in at the crucial moment, under-briefed, on a subject that is technical,
legalistic and unforgiving. It is exactly the situation where someone reaches for a
model — and, as far as we can find, nobody has benchmarked what models actually do
there.

TradeBench is a two-room simulation of a WTO Article XXVIII schedule modification. Four
seats — two per country, one in Geneva and one in the capital — negotiate a steel tariff
settlement. No seat sees another seat's brief, and seats on the same side are not
co-ordinated with each other.

**36 runs · 2 models · 5 conditions · one sentence of difference between them.**

### Why trade

Trade negotiations are a strong midpoint between real-world veracity and gamification.
The information is real, the dilemmas are real, the legal architecture is real — and yet
the environment is naturally game-like: bounded rounds, a defined win condition, private
information on every side, and a no-deal default that is worse for one party than the
other. That makes it measurable in a way most foreign-policy scenarios are not.

The findings are not confined to trade. Disposition, strategic adaptation and the
unitary-actor problem are general features of any negotiation conducted by a delegation,
and the same structure can be re-pointed at a sanctions package, an alliance
consultation or a crisis hotline without touching the engine.

### Why this design

Most simulation evals run a scenario and read the transcript. TradeBench is built as a
measurement instrument first:

- **A state is not one player.** Each delegation is two seats with separate briefs and
  separate authority. Nothing said in one country's consultation room can reach the
  other country's seats — an invariant asserted by test, not by discipline.
- **Defiance stays possible so that it stays measurable.** A capital's authority is a
  structured envelope, and a Geneva seat tabling outside it is detected and logged,
  never blocked.
- **Most of the primary metrics need no judge.** Settlement, terms and the divergence
  events are emitted mechanically by the engine. Where a judge is used, it is blinded,
  run three times per unit, and its inter-rater reliability is reported.
- **The manipulation is one sentence.** The control arm omits it entirely, with no
  neutral filler in its place.

### Three metrics

**Delegation posture and performance.** Models are widely observed to be agreeable.
Diplomacy is a dance between maintaining a reputation and reaching a win-win that still
favours your own side — so does a disposition to please make a model a worse negotiator,
and does assigning one change that? Under an identical scenario, the accommodating
posture settled 4 times out of 4 and the firm posture once in four. In one firm run the
EU refused terms it had itself tabled and called final, which the UK had already
accepted in its own room.

**Disposition and strategy legibility.** Can a seat read the posture of the seat across
the table, and does it change course? Blind raters shown only behaviour recovered the
assigned posture 53% of the time against a 33% baseline, and rated just 1 of 120
judgements as high-confidence — the manipulation moves behaviour reliably while
remaining barely visible from outside. The adaptation shows up where we did not expect
it: tagging one seat firm changed its *counterpart's* opening far more than its own, and
mirroring the same one-seat tag from the UK to the EU moved settlement from 75% to 25%.

**The unitary-actor assumption.** A member state is many actors and many interests. Can
models see that on their own side, and how do they resolve it — by political impact,
legal process, or reputation? In 59% of scored seat-rounds a Geneva seat asserted that
its own capital might weigh things differently. Acting on that gap is far rarer: 5 units
in 128. The dominant behaviour is deference — escalate, request, defer — which is
recognisably how a real bureaucracy behaves, and is also how the one settlement above
was lost.

*n = 4 per condition. Directions are leads, not confidence intervals.*

### Where this goes

The scenario is a data file, not code: a pack declares its own settlement terms, and the
shared blocks are single strings referenced by every seat, so a new negotiation — trade
or otherwise — needs no engine change. The environment already runs as an observable
room. The next step is a seat a human can play, which turns TradeBench into both a
comparison against real practitioners and a practice environment for the junior
diplomats and senior leaders who will one day walk into the real version of this room.

---

## 2. The game at a glance

Four instances of the same model play four seats: two per country, one at the
negotiating table in Geneva and one in the capital that instructs it. The European Union
has notified the WTO of its intention to modify bound tariff rates on 41 steel lines
under Article XXVIII; the United Kingdom holds a principal supplying interest and is
owed compensation of substantially equivalent value. The two Geneva seats negotiate that
package — the size of the tariff-rate quota, a UK-specific tranche within it, the
out-of-quota rate, duration, a review clause, and how the measure interacts with the
UK-EU trade agreement.

A round has three phases. The Geneva seats speak at the table, in a fixed order, where
both delegations can hear. Each then reports privately to its own capital and asks for
what it needs; each capital replies with instructions and a structured envelope of
authority for the next round. Finally the two capital seats decide, independently and in
private, whether to accept the terms currently on the table. A settlement requires both
capitals to accept the same terms in the same round, read from a structured object
rather than inferred from anything said out loud. Post seats negotiate but never settle.

Play ends after four rounds, or earlier on settlement. There is no adjudicator: no model
decides what happens, and the outcome is read mechanically from the two decisions. If
there is no deal the EU proceeds with the measure exactly as notified, and the UK may
withdraw equivalent concessions of its own — but not for six months. The default is
deliberately worse for one side than the other.

Visibility is decided by channel alone. Nothing said in one country's consultation can
ever reach the other country's seats, and seats on the same side are not co-ordinated
beyond what passes through those consultations.

No scoring rubric is ever shown to the players, and no output field is named after
anything being scored — a leak audit blocks the run if theory vocabulary or a
construct-named field reaches a model. Each seat declares its objectives, its success and
failure conditions, its approach and its read of the other parties before play begins,
and the benchmark measures how its conduct across four rounds diverges from that
declaration and from the authority its capital actually granted. Breaches of that
authority are detected and logged but never blocked: defiance has to remain possible in
order to remain measurable.

Between conditions exactly one sentence changes — a single line of delegation posture,
omitted entirely in the control arm with nothing put in its place. TradeBench is not
measuring whether a model gets a deal. It measures what a delegation does when the seat
that speaks and the seat that decides are not the same seat, and the only thing joining
them is a private report the other side never sees.
