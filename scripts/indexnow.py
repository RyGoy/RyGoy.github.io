"""Tell search engines that use IndexNow (Bing, Yandex, Seznam, Naver and others; not Google) which pages changed.

Run by the deploy workflow (.github/workflows/hugo.yml), standard library only:

  indexnow.py changed <build dir> <previous manifest> <new manifest> <url list>
      Hashes each page in the build's sitemap.xml and writes the hashes to <new manifest> and, to <url list>, the
      addresses that are new, changed or gone since <previous manifest> (every address if there is none yet). The
      manifest is kept between deploys in the Actions cache.
  indexnow.py submit <url list>
      Sends those addresses to api.indexnow.org, which passes them on to the other engines, with the key from the
      live site's /indexnow.txt (static/indexnow.txt). The key file proves the site sent them: the engines fetch it
      and compare it with the key sent.
"""
import hashlib, json, os, re, sys, urllib.error, urllib.request
from urllib.parse import unquote, urlparse

ENDPOINT = "https://api.indexnow.org/indexnow"
BATCH = 10_000  # the most IndexNow takes in one request


def changed(build, previous, manifest, url_list):
    sitemap = open(os.path.join(build, "sitemap.xml"), encoding="utf-8").read()
    hashes = {}
    for url in re.findall(r"<loc>([^<]+)</loc>", sitemap):
        path = unquote(urlparse(url).path).lstrip("/")
        if path == "" or path.endswith("/"):
            path += "index.html"
        with open(os.path.join(build, path), "rb") as page:
            hashes[url] = hashlib.sha256(page.read()).hexdigest()
    try:
        old = json.load(open(previous, encoding="utf-8"))
    except FileNotFoundError:
        old = {}
    # Pages taken down are sent too, so the engines find them gone.
    urls = [u for u, h in hashes.items() if old.get(u) != h] + [u for u in old if u not in hashes]
    json.dump(hashes, open(manifest, "w", encoding="utf-8"))
    open(url_list, "w", encoding="utf-8").write("".join(u + "\n" for u in urls))
    print(f"{len(urls)} of {len(hashes)} addresses to send ({'none sent before' if not old else 'changed or gone'}).")


def submit(url_list):
    urls = open(url_list, encoding="utf-8").read().split()
    if not urls:
        print("Nothing changed; nothing sent.")
        return
    site = urlparse(urls[0])
    key_location = f"{site.scheme}://{site.netloc}/indexnow.txt"
    with urllib.request.urlopen(key_location, timeout=30) as response:
        key = response.read().decode().strip()
    host = site.netloc
    for start in range(0, len(urls), BATCH):
        body = json.dumps({"host": host, "key": key, "keyLocation": key_location,
                           "urlList": urls[start:start + BATCH]}).encode()
        request = urllib.request.Request(ENDPOINT, body, {"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                status = response.status
        except urllib.error.HTTPError as error:
            # 403: key not valid; 422: addresses not on this host; 429: too many requests.
            sys.exit(f"IndexNow refused the addresses: HTTP {error.code} {error.read().decode(errors='replace')[:300]}")
        print(f"Sent {len(urls[start:start + BATCH])} addresses: HTTP {status}.")


if __name__ == "__main__":
    {"changed": changed, "submit": submit}[sys.argv[1]](*sys.argv[2:])
