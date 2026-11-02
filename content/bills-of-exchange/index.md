+++
title = "Bills of Exchange"
description = "How a bill of exchange moves a debt between parties, who stands as surety for whom, and how each step is recorded in the books."
+++

A bill of exchange is a written order that moves a debt from one place to another. Most of the law around it exists to answer one question at every step: **who is liable, and in what order?** Accounting answers the same question in numbers. This page walks through both, first for the adult reader, then for a five-year-old.

**One assumption runs through this whole page:** every signature is authorized. Each person who signs has the authority to bind the party they sign for, so every obligation described below is valid and enforceable. The page explains the mechanism, not whether a particular signature was authorized.

---

## Part 1: The mechanics

### What a bill of exchange is

The Bills of Exchange Act defines a bill as:

> an unconditional order in writing, addressed by one person to another, signed by the person giving it, requiring the person to whom it is addressed to pay, on demand or at a fixed or determinable future time, a sum certain in money to or to the order of a specified person or to bearer.

Taken apart, a bill must be:

| Element | What it means |
|---|---|
| **Unconditional** | "Pay $1,000," not "pay $1,000 if the shipment arrives." |
| **An order** | It commands payment. A request or a promise is not enough. |
| **In writing and signed** | The person giving the order signs it. |
| **Addressed to one person by another** | There is always someone giving the order and someone receiving it. |
| **A sum certain in money** | The amount can be worked out exactly from the face of the bill. |
| **Payable on demand or at a set time** | "On demand," "60 days after sight," or "on March 1." |
| **Payable to a named person, to their order, or to bearer** | This is what lets the bill be passed on to someone else. |

A **cheque** is a bill drawn on a bank and payable on demand. A **promissory note** is a close relative: a *promise* to pay instead of an *order* to pay, so it has two parties instead of three.

### The parties

| Party | Role |
|---|---|
| **Drawer** | Writes and signs the order. Usually the creditor. |
| **Drawee** | The person ordered to pay. Usually the debtor. |
| **Payee** | The person to be paid. Often the drawer itself. |
| **Acceptor** | The drawee, once they sign the bill to agree to pay it. |
| **Endorser** | A holder who signs the back of the bill to pass it on. |
| **Holder** | Whoever currently possesses the bill and is entitled to payment. |
| **Accommodation party** | Someone who signs only to lend their name and credit. They receive nothing for it. |

### The life of a bill, step by step

1. **An underlying debt exists.** A seller delivers goods and the buyer owes for them. The bill doesn't create value; it formalizes a debt that already exists.
2. **Drawing.** The seller (drawer) writes an order addressed to the buyer (drawee): "Sixty days after sight, pay to my order $1,000."
3. **Presentment for acceptance.** The drawer shows the bill to the drawee.
4. **Acceptance.** The drawee writes "Accepted" across the face and signs. **This is the moment the drawee becomes liable on the bill.** Before acceptance, the drawee owes nothing *on the bill*; the order is only a request backed by the drawer's credit. After acceptance, the drawee is the **acceptor**, the party primarily liable.
5. **Negotiation.** The holder can pass the bill to someone else by endorsing it (signing the back) and delivering it. Each new holder can do the same. The bill can settle several debts as it moves.
6. **Presentment for payment.** On the due date, the current holder presents the bill to the acceptor.
7. **Payment and discharge.** The acceptor pays the holder. Payment by the acceptor at maturity **discharges the bill**: every obligation on it ends at once, for every party.
8. **Or dishonour.** If the acceptor refuses to pay, the bill is *dishonoured*. The holder must promptly give **notice of dishonour** to the earlier signers. Without proper notice, a signer can be released.

### Signing for someone else

A person who signs as an agent and makes it clear on the bill ("per," "for," "on behalf of") binds the principal they represent, not themselves. Under this page's assumption, that authority exists, so the principal is bound. Someone who signs with no such words is treated as signing in their own name.

### Who is liable, and in what order

This is where suretyship comes in. A bill sets up a **chain of liability**:

- **The acceptor is the primary obligor.** Their promise is unconditional: they will pay when the bill falls due.
- **The drawer and every endorser are secondarily liable.** Each one promises any later holder that the bill will be paid. If it is dishonoured and they receive proper notice, they will pay it themselves. That is a surety's promise: *I pay only if the principal doesn't.*
- **An accommodation party is a surety in its purest form.** They sign so that their credit stands behind someone else's, and they receive nothing for doing so.

When a secondary party has to pay, the bill is **not** discharged. That party takes the bill back and can collect from anyone who signed before them, and ultimately from the acceptor. Liability always flows back up the chain toward the acceptor, the one party who was always supposed to pay.

```
           primary obligor
               ACCEPTOR  (drawee who signed "Accepted")
                  ▲
                  │ recourse flows back up the chain
                  │
   DRAWER ──► ENDORSER 1 ──► ENDORSER 2 ──► HOLDER
   (surety)    (surety)       (surety)      (collects)

   The bill moves to the right. Recourse moves to the left.
```

### The accounting

The worked example uses three companies, with every signature authorized:

- **Alder Ltd.** sells goods to Birch and draws the bill. Alder is the **drawer**.
- **Birch Ltd.** buys the goods and accepts the bill. Birch is the **drawee**, then the **acceptor**.
- **Cedar Ltd.** is Alder's own supplier. Alder pays a debt to Cedar by endorsing the bill over, which makes Cedar the **holder**.

Amount: $1,000. Term: 60 days.

#### Step 1. The sale (no bill yet)

| Books of | Account | Debit | Credit |
|---|---|---|---|
| Alder | Accounts Receivable – Birch | 1,000 | |
| Alder | Sales | | 1,000 |
| Birch | Inventory | 1,000 | |
| Birch | Accounts Payable – Alder | | 1,000 |

#### Step 2. Alder draws the bill and Birch accepts it

The debt changes **form**, not **size**. An open account becomes a formal, transferable instrument.

| Books of | Account | Debit | Credit |
|---|---|---|---|
| Alder | Bills Receivable | 1,000 | |
| Alder | Accounts Receivable – Birch | | 1,000 |
| Birch | Accounts Payable – Alder | 1,000 | |
| Birch | Bills Payable | | 1,000 |

Before acceptance, there would be no entry on Birch's books for the bill. Acceptance is what moves the obligation onto the instrument.

#### Step 3. Alder endorses the bill to Cedar to pay its own debt

Alder owed Cedar $1,000 for supplies. Instead of paying cash, Alder signs the back of the bill and hands it over.

| Books of | Account | Debit | Credit |
|---|---|---|---|
| Alder | Accounts Payable – Cedar | 1,000 | |
| Alder | Bills Receivable | | 1,000 |
| Cedar | Bills Receivable | 1,000 | |
| Cedar | Accounts Receivable – Alder | | 1,000 |

Two debts were settled with one piece of paper, and no cash has moved yet. **But Alder is not free.** By endorsing, Alder became a surety for Birch's payment to Cedar. Alder records no liability for this, because nothing is owed unless Birch defaults. Alder **discloses a contingent liability** in the notes to its financial statements: "Bills receivable endorsed to third parties, $1,000, on which the company is contingently liable."

#### Step 4a. At maturity, Birch pays

| Books of | Account | Debit | Credit |
|---|---|---|---|
| Birch | Bills Payable | 1,000 | |
| Birch | Cash | | 1,000 |
| Cedar | Cash | 1,000 | |
| Cedar | Bills Receivable | | 1,000 |
| Alder | *No entry. The contingent liability disclosure is removed.* | | |

The primary obligor paid, so the bill is discharged and every party's obligation ends. One payment of $1,000 settled two separate debts.

#### Step 4b. Or: at maturity, Birch dishonours the bill

Cedar gives Alder notice of dishonour and collects from Alder, the surety.

| Books of | Account | Debit | Credit |
|---|---|---|---|
| Cedar | Cash | 1,000 | |
| Cedar | Bills Receivable | | 1,000 |
| Alder | Receivable – Birch (dishonoured bill) | 1,000 | |
| Alder | Cash | | 1,000 |
| Birch | Bills Payable | 1,000 | |
| Birch | Accounts Payable – Alder (dishonoured bill) | | 1,000 |

What happened here:

- Cedar is paid in full. Cedar held a bill backed by two parties, and the second one paid.
- Alder's contingent liability became a real payment. Alder takes the bill back and now holds the claim against Birch.
- **Birch's debt did not disappear.** Dishonour only changes who Birch owes. Birch still owes $1,000, now to Alder instead of to the holder of the bill.

#### The whole story on one line

| | Alder (drawer, endorser) | Birch (acceptor) | Cedar (holder) |
|---|---|---|---|
| **Liability on the bill** | Secondary: surety | Primary | None; Cedar is owed |
| **If Birch pays** | Released | Discharged | Paid |
| **If Birch dishonours** | Pays Cedar, then recovers from Birch | Still owes, now to Alder | Paid by Alder |

### The principles behind the entries

1. **Every entry has two sides.** Whatever one party gains as an asset, another records as an obligation. A bill never appears on only one set of books.
2. **Moving paper changes the form of a debt, not its size.** Drawing, accepting and endorsing a bill rearrange who owes whom. The total owed in the system stays the same until someone pays.
3. **Acceptance is the assumption of liability.** The drawee owes nothing on a bill until they accept it. Once they do, they are the primary obligor.
4. **Signers after the acceptor are sureties.** The drawer and endorsers stand behind the acceptor. They pay only on dishonour and notice, and they keep the right to recover from earlier parties.
5. **A surety's obligation is contingent.** It is disclosed in the notes, not booked as a liability, until the principal defaults.
6. **When a surety pays, the debt moves to the surety; it doesn't disappear.** The surety steps into the creditor's place against the principal.
7. **Only payment by the primary obligor ends the chain.** When the acceptor pays at maturity, the bill is discharged for everyone.

Accounting, put simply, is the record of **who bears the obligation at each moment**, and of how that obligation passes from one party to another until it is finally paid.

---

## Part 2: Explained to a five-year-old

Mia has a lemonade stand. Leo wants a cup, but he has no stickers to pay with today.

So Mia writes a note:

> **"Leo, please give one sticker to whoever brings you this note on Saturday. — Mia"**

Leo reads it and writes underneath: **"Okay, I will. — Leo."** Now Leo has *promised*. That is called **accepting**.

Mia owes her big brother Sam a sticker. Instead of giving him one, she turns the note over, writes her name on the back, and gives the note to Sam.

Writing her name on the back means something special. It means: **"If Leo doesn't give you the sticker, I will."** Mia is now Leo's **helper-promiser**. Grown-ups call that a **surety**.

**On Saturday, one of two things happens:**

**Leo gives Sam the sticker.** Everyone is even. Leo paid for his lemonade, Mia paid Sam back, and only one sticker moved. The note goes in the bin.

**Leo says "No."** Sam goes back to Mia, because she promised. Mia gives Sam a sticker. Then Mia keeps the note and says, "Leo, now you owe the sticker to *me*." Leo still has to pay. He just pays Mia instead of Sam.

**The big idea:** the note can pass from hand to hand and tell everyone who has to pay. Each person who signs it promises to help if the one before doesn't pay. But the sticker still has to come from Leo in the end, because Leo is the one who said "I will."
