---
title: "The key that loads the other keys"
description: "A Git wrapper blocked a list of settings that were too dangerous to allow, and the list was correct. One setting it did not block tells Git to read a file and apply everything inside it, which put the whole list back within reach."
pubDatetime: 2026-09-26T06:00:00Z
severity: "critical"
target: "simple-git"
theme: "web"
tags: ["argument-injection", "denylist", "supply-chain", "methodology"]
---

I passed one string into a clone of a completely harmless repository, and a
command of my choosing ran as the application's own user. No attacker URL, no
attacker branch, nothing wrong in the repository being cloned.

The library had a blocklist of settings it refused to pass through, and the
blocklist worked. Every setting on it was correctly rejected. The problem was a
setting that was not on it, whose only job is to load a file full of settings.

| | |
|---|---|
| Affected | `simple-git` 3.36.0 and earlier |
| Fixed in | `simple-git` 4.0.0, on npm 2026-09-25 |
| Reported | 2026-05-07 |
| Tested on | git 2.39.3 and 2.43, Node v22 and v25, Linux and macOS |

## Why the blocklist exists

`simple-git` is the common way to use Git from a Node application. It works by
running the real `git` command for you.

That matters because some Git settings do not store a value, they name a program
for Git to run. `core.pager` is the program that shows long output.
`core.editor` opens when you write a commit message. `core.hooksPath` is a
folder of scripts Git runs at various moments. You can set any of them on the
command line:

```bash
git -c core.pager=/tmp/myscript log
```

That is not configuration. That is picking a command to execute.

So if an application lets a user influence the arguments it hands to `git`, it
is one careless string away from running whatever that user wants. `simple-git`
knows this and ships a guard for it, which holds a list of twenty-three
dangerous setting names and rejects any argument that matches. Every name on
that list is there for a good reason, and several were added after somebody
found a way past an earlier version of it.

## The setting that was not on the list

Git has a setting called `include.path`. It takes a filename and it means "read
that file as config and apply everything in it, right here".

Everything. Including names the blocklist would have rejected, because by the
time they take effect they were never arguments. They were lines in a file, and
a guard that reads arguments cannot see inside a file.

Here is the guard judging both, which is the clearest evidence in the whole
report:

```js
const { vulnerabilityCheck } = require('@simple-git/argv-parser');

vulnerabilityCheck(['-c', 'core.hooksPath=/tmp/evil', 'clone'], {});
// throws, correctly blocked

vulnerabilityCheck(['-c', 'include.path=/tmp/evil-config', 'clone'], {});
// returns [], nothing wrong here
```

The first call is the guard doing its job perfectly. The second is the same
outcome, spelled differently.

So the attack is two steps. Get a small text file onto disk at a path you can
name, holding a few lines of ordinary Git config. Then get one string,
`include.path=` plus that path, into the arguments. From there you are not
getting past the blocklist one name at a time. You have all of it.

I showed four, each a different everyday operation:

| What the smuggled file set | What ran it |
|---|---|
| a filter program | cloning a harmless repository |
| `protocol.allow`, re-enabling the `ext::` transport | a clone, using two older payloads this library already blocks |
| `core.hooksPath` | the next commit |
| `diff.textconv` | `log -p`, `show` and `diff` |

The last row is the one worth sitting with. Those are not write operations.
Nothing is committed, pushed or checked out. A code review dashboard runs them
on every page load, and the operation that looks most like reading is the one
that executes.

## Two settings that needed no file

While checking whether each blocked name had relatives, two turned up that need
nothing on disk at all.

`filter.<name>.smudge` and `filter.<name>.clean` were both blocked. Git also
accepts `filter.<name>.process`, which does the same job a different way. Not on
the list. It fires when the cloned repository has a `.gitattributes` file
pointing a filter at some paths, which a huge number of ordinary repositories do
for line endings or Git LFS. The attacker does not need to control the
repository. They just repoint a filter that is already in it.

`submodule.<name>.update` was the other. Give it a value starting with `!` and
Git runs the rest as a shell command on every submodule update, which happens
during any clone with `--recurse-submodules`.

These two are the more serious half of the report, because they need only the
one string. And the string is the whole payload, because Git runs these values
through a shell:

```
$ git -c "filter.y.process=sh -c 'id > /tmp/proof'" clone repo dest
EXECUTED

$ git -c "diff.x.textconv=id > /tmp/proof #" log -p -1
EXECUTED
```

Observed on git 2.54.0. Nothing had to be written to disk first. Worth saying
plainly, because the obvious guess about a bug like this is wrong:
`simple-git` never uses a shell. It spawns `git` with an argument array, which
is the correct way to do it, so there is no quoting flaw to find. The shell is
Git's, and these settings are documented to take commands. The attacker is not
escaping anything. They are using a feature through a guard that was supposed to
stop them naming it.

## What I learned

**Look for the loader, not the missing name.** This library's whole bypass
history is somebody spotting a name nobody listed, or a different spelling, or
the long form of a flag. A setting that reads a file, follows a URL or expands a
variable is different in kind. It is not one more entry, it is a door to every
entry.

**Check whether a blocked thing has relatives.** `filter.smudge` and
`filter.clean` were blocked, `filter.process` was not. When you find one name on
a list, read the upstream documentation around it and check the whole family.

**A merged fix is not a shipped fix.** The patch was merged three days after my
report. The release anybody could install arrived four and a half months later,
and for that whole gap "upgrade" had nothing to point at.

**I was wrong about the blocklist.** I argued it could never hold and that the
answer was to invert it, allowing a few safe settings and rejecting the rest.
The maintainer kept it, audited the whole class instead of patching my six
reports, and put each dangerous setting behind a named opt-in like
`allowUnsafeInclude`. Still a blocklist, and a much better one than the one I
said could not work.
