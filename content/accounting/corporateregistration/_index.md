+++
title = "Corporate Registration"
description = "Where to register a corporation, the law it is made under, where to file security interests, and what it takes to form one, in Canada (federally and in each province and territory) and in each of the 50 US states."
weight = 4
# The "at the time of this writing" notice, shown on this page and on every jurisdiction's page.
notice = """
**At the time of this writing, November 2026.** Every link, quoted section, fee and tax rate on this page was checked in November 2026. Governments move their web pages, amend and renumber their statutes, and change their fees and rates, so some of it will go out of date. Check the current official text before relying on anything here.

If a link no longer works, this is what it was there to help you do, and how to find it again:

- **Register** opens the office that forms corporations: where you reserve a name, file the articles of incorporation and file the yearly report. Search for the office named in the link, with the word "incorporate".
- **Legislation** opens the statute that says how a corporation is made and run, on the site where the government publishes its laws. Search for the act's name and the citation beside it. A few states publish their codes only through LexisNexis's free public site, which opens at the whole code: look for the chapter named in the citation.
- **UCC-1 filing** (United States) and **PPSA registry** (Canada) open the registry where a lender records a security interest in a borrower's personal property, such as equipment, inventory or vehicles, and where you search for one before you buy or lend. Search for the registry named in the link, or the jurisdiction's name with "UCC filing" or "personal property registry".
- **source**, after a summary, opens the page the summary was checked against. If it has moved, look for the same fact on the official site of the office or department that publishes it.
- **Read the act**, under "What the act requires", on each jurisdiction's page, opens the statute the quoted sections come from. The section numbers let you find the same words in a later version, unless the statute has been renumbered.
"""
# The section page and every jurisdiction's page use layouts/corporate-registration/.
type = "corporate-registration"
[cascade]
type = "corporate-registration"
# The countries in order, each with the label of its security-interest registry line, an optional note shown under its
# heading, and its regions in order.
# Each jurisdiction's page names its country and region; layouts/corporate-registration/list.html lists them in this order.
[[countries]]
name = "Canada"
security_label = "PPSA registry"
note = "A corporation can be made federally or in a province or territory. A federal corporation registers in each province where it does business, files its security interests there and pays that province's tax. Federal corporate tax applies on top of every provincial and territorial rate. The federal card's flag is the Canadian Red Ensign of 1921."
regions = ["Federal", "Atlantic Canada", "Central Canada", "Western Canada", "The North"]
[[countries]]
name = "United States"
security_label = "UCC-1 filing"
regions = ["Northeast", "Midwest", "South", "West"]
+++

Each Canadian province and territory, Canada itself, and each US state has its own registry of corporations and its own statute saying how one is made. Choose a jurisdiction to see:

- where to register a corporation, and where to file security interests;
- the statute, and what it requires the articles of incorporation to say, in its own words;
- a short summary of its legal system, the least it takes to form and keep a corporation, whether it gives number names, and how it taxes a corporation.
