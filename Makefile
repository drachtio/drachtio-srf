
.PHONY: doc publish-doc
doc:
	jsdoc -c ./support/jsdoc/jsdoc.json
	node support/jsdoc/jsdoc-fix-html.js

publish-doc: doc
	git diff-files --quiet # fail if unstanged changes
	git diff-index --quiet HEAD # fail if uncommited changes
	npm run-script jsdoc
	gh-pages-deploy
