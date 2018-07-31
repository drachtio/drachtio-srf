#!/bin/sh
STASH_NAME="pre-commit-$(date +%s)"
git stash save -q --keep-index $STASH_NAME

npm test

STASHES=$(git stash list)
if [[ $STASHES == "$STASH_NAME" ]]; then
  git stash pop -q

