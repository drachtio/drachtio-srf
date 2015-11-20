MOCHA_OPTS= --check-leaks --bail
REPORTER = spec
NODE_ENV = test
MOCHA = ./node_modules/.bin/mocha --reporter $(REPORTER) $(MOCHA_OPTS)

.PHONY: test debug-test

test:
	for file in ./test/acceptance/*.js; do NODE_ENV=test $(MOCHA) $$file; done

debug-test:
	for file in ./test/acceptance/*.js; do NODE_ENV=test, DEBUG=* $(MOCHA) $$file; done

