import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SITES,
  isReadingSite,
  matchPatterns,
  pageKindFor,
  siteForHostname,
  siteLabel
} from "../src/core/sites.ts";


describe("supported sites", () => {

  it("recognises sites by hostname, including subdomains", () => {

    assert.equal(siteForHostname("leetcode.com")?.id, "leetcode");
    assert.equal(siteForHostname("www.youtube.com")?.id, "youtube");
    assert.equal(siteForHostname("www.geeksforgeeks.org")?.id, "geeksforgeeks");
    assert.equal(siteForHostname("developer.mozilla.org")?.id, "mdn");
    assert.equal(siteForHostname("en.cppreference.com")?.id, "cppreference");
    assert.equal(siteForHostname("www.khanacademy.org")?.id, "khanacademy");

  });


  it("ignores other sites, including look-alikes", () => {

    assert.equal(siteForHostname("example.com"), null);
    assert.equal(siteForHostname("notleetcode.com"), null);
    assert.equal(siteForHostname("mozilla.org"), null);

  });


  it("tells problem pages from reading pages", () => {

    const site = (id: string) => SITES.find(s => s.id === id)!;

    assert.equal(pageKindFor(site("codeforces"), "/problemset/problem/4/A"), "problem");
    assert.equal(pageKindFor(site("codeforces"), "/blog/entry/123"), "reading");
    assert.equal(pageKindFor(site("hackerrank"), "/challenges/simple-array-sum/problem"), "problem");
    assert.equal(pageKindFor(site("geeksforgeeks"), "/problems/two-sum/1"), "problem");
    assert.equal(pageKindFor(site("geeksforgeeks"), "/dsa/introduction-to-arrays/"), "reading");
    assert.equal(pageKindFor(site("coursera"), "/learn/machine-learning"), "course");

  });


  it("knows which sites are tracked as reading", () => {

    assert.equal(isReadingSite("leetcode"), false);
    assert.equal(isReadingSite("youtube"), false);
    assert.equal(isReadingSite("mdn"), true);
    assert.equal(isReadingSite("unknown"), false);
    assert.equal(siteLabel("mdn"), "MDN Web Docs");

  });


  it("gives the manifest a pattern for every site", () => {

    const patterns = matchPatterns();

    assert.equal(patterns.length, SITES.length * 2);
    assert.ok(patterns.includes("https://*.geeksforgeeks.org/*"));
    assert.ok(patterns.every(p => p.startsWith("https://")));

  });

});
