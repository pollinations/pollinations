# Project management of bolt.diy

First off: this sounds funny, we know. "Project management" comes from a world of enterprise stuff and this project is
far from being enterprisy ;)

But we need to organize ourselves somehow, right?

So here's how we structure long-term vision, mid-term capabilities of the software and short term improvements.

## Strategic epics (long-term)

Strategic epics define areas in which the product evolves. Usually, these epics don’t overlap. They shall allow the core
team to define what they believe is most important and should be worked on with the highest priority.

You can find the [epics as issues](https://github.com/stackblitz-labs/bolt.diy/labels/epic) which are probably never
going to be closed.

What's the benefit / purpose of epics?

1. Prioritization

E. g. we could say “managing files is currently more important that quality”. Then, we could thing about which features
would bring “managing files” forward. It may be different features, such as “upload local files”, “import from a repo”
or also undo/redo/commit.

In a more-or-less regular meeting dedicated for that, the core team discusses which epics matter most, sketch features
and then check who can work on them. After the meeting, they update the roadmap (at least for the next development turn)
and this way communicate where the focus currently is.

2. Grouping of features

By linking features with epics, we can keep them together and document *why* we invest work into a particular thing.

## Features (mid-term)

We all know probably a dozen of methodologies following which features are being described (User story, business
function, you name it).

However, we intentionally describe features in a more vague manner. Why? Everybody loves crisp, well-defined
acceptance-criteria, no? Well, every product owner loves it. because he knows what he’ll get once it’s done.

But: **here is no owner of this product**. Therefore, we grant *maximum flexibility to the developer contributing a
feature* – so that he can bring in his ideas and have most fun implementing it.

The feature therefore tries to describe *what* should be improved but not in detail *how*.

## PRs as materialized features (short-term)

Once a developer starts working on a feature, he/she can open a draft-PR asap to discuss / describe / share, how he/she
is going to tackle the problem.

Once it’s merged, a squashed commit contains the whole PR description which allows for a good change log.
