# Apuração Presidencial 2026

Painel da eleição presidencial com o 2º turno de 2026 ao vivo e o histórico desde 2014.

- **Ao vivo:** o navegador lê os arquivos oficiais de `resultados.tse.jus.br` a cada 15 segundos (Brasil, estados e exterior), a cada 90 segundos (cidades do exterior e municípios dos estados em tela) e a cada 45 segundos (zonas dos municípios em tela).
- **Histórico e detalhe:** `data/` traz os resultados de 2014 a 2026 (1º turno) por estado, município, zona eleitoral e local de votação, somados dos arquivos do Portal de Dados Abertos do TSE.
- **Mapa:** MapLibre GL com mapa base do OpenFreeMap. A área das zonas eleitorais é aproximada (união das células de Voronoi dos locais de votação de cada zona, recortada pelo município), porque o TSE não publica o contorno oficial das zonas.

Site estático: não há servidor nem chave de API.
