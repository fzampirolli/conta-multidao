"""Busca e baixa fotos com LICENÇA ABERTA (Creative Commons / domínio público) do Flickr,
registrando autor, licença, link e SHA-256 de cada arquivo (proveniência verificável).

Uso:
  export FLICKR_API_KEY=...   # chave gratuita em https://www.flickr.com/services/api/misc.api_keys.html
  python python/baixar_flickr.py --texto "avenida paulista" --data 2026-10-11 --saida dados/meu-evento
  python python/baixar_flickr.py --usuario 157736962@N05 --data 2026-10-11 --saida dados/meu-evento

Só baixa fotos cujas licenças permitem redistribuição; as demais não são usadas.
"""
import argparse, datetime as dt, hashlib, json, os, time, urllib.parse, urllib.request

LICENCAS = {  # ids do Flickr → nome (somente licenças que permitem redistribuição)
    "1": "CC BY-NC-SA 2.0", "2": "CC BY-NC 2.0", "3": "CC BY-NC-ND 2.0", "4": "CC BY 2.0",
    "5": "CC BY-SA 2.0", "6": "CC BY-ND 2.0", "7": "Sem restrições de copyright conhecidas",
    "9": "CC0 1.0", "10": "Domínio público (PDM)", "11": "CC BY 4.0", "12": "CC BY-SA 4.0",
    "13": "CC BY-ND 4.0", "14": "CC BY-NC 4.0", "15": "CC BY-NC-SA 4.0", "16": "CC BY-NC-ND 4.0",
}

def api(metodo, **p):
    p.update(method=metodo, api_key=os.environ["FLICKR_API_KEY"], format="json", nojsoncallback=1)
    with urllib.request.urlopen("https://api.flickr.com/services/rest/?" + urllib.parse.urlencode(p)) as r:
        return json.load(r)

def baixar(url, destino, tentativas=5):
    for t in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "conta-multidao/1.0"})
            with urllib.request.urlopen(req) as r, open(destino, "wb") as f:
                f.write(r.read())
            return
        except Exception:
            time.sleep(5 * (t + 1))  # respeita o limite de requisições do servidor
    raise RuntimeError("falha ao baixar " + url)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--texto"); ap.add_argument("--usuario")
    ap.add_argument("--data", required=True, help="AAAA-MM-DD (data em que as fotos foram tiradas)")
    ap.add_argument("--saida", required=True)
    ap.add_argument("--tamanho", default="url_k", help="url_k (2048 px), url_h (1600), url_o (original)")
    a = ap.parse_args()
    d0 = dt.date.fromisoformat(a.data)
    filtros = dict(min_taken_date=str(d0), max_taken_date=str(d0 + dt.timedelta(days=1)),
                   license=",".join(LICENCAS), per_page=500,
                   extras=f"license,owner_name,date_taken,description,o_dims,{a.tamanho}")
    if a.texto: filtros["text"] = a.texto
    if a.usuario: filtros["user_id"] = a.usuario
    res = api("flickr.photos.search", **filtros)["photos"]["photo"]
    os.makedirs(a.saida, exist_ok=True)
    meta = []
    for p in res:
        url = p.get(a.tamanho) or p.get("url_h") or p.get("url_o")
        if not url: continue
        arq = f"{p['id']}.jpg"
        destino = os.path.join(a.saida, arq)
        if not os.path.exists(destino):
            baixar(url, destino); time.sleep(1.5)
        sha = hashlib.sha256(open(destino, "rb").read()).hexdigest()
        meta.append({"arquivo": arq, "sha256": sha, "titulo": p["title"], "autor": p["ownername"],
                     "data": p["datetaken"], "licenca": LICENCAS[p["license"]],
                     "url": f"https://www.flickr.com/photos/{p['owner']}/{p['id']}"})
        print(arq, meta[-1]["licenca"], meta[-1]["autor"])
    json.dump({"fonte": "Flickr API", "consulta": filtros, "fotos": meta},
              open(os.path.join(a.saida, "fontes.json"), "w"), ensure_ascii=False, indent=2)
    print(f"{len(meta)} fotos com licença aberta salvas em {a.saida}")

if __name__ == "__main__":
    main()
