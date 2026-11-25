const KB_MAPA = '00000000-0000-4000-8000-00000000000b';
const apiBase = () => String(environments.PIPEELO_API_URL || 'https://api.pipeelo.com/v1').replace(/\/+$/, '').replace(/(\/v1)?$/, '/v1');
const lerMapa = async () => {
    const r = await axios.get(`${apiBase()}/knowledge-base/${KB_MAPA}`, { headers: { Authorization: `Bearer ${environments.PIPEELO_API_TOKEN}` }, validateStatus: () => true, timeout: 10000 });
    if (r.status !== 200) throw new Error(`mapa: HTTP ${r.status}`);
    const g = JSON.parse(r.data.data.context);
    return g.features.map(f => ({ tipo: f.properties.tipo, nome: f.properties.nome, poly: f.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]) }));
};
const dentroDe = (lat, lng, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [yi, xi] = poly[i], [yj, xj] = poly[j];
        if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
};
return (async () => {
    let mapa;
    try { mapa = await lerMapa(); } catch (e) { return 'ERRO_MAPA: NÃO ofereça data. Transfira para o setor humano.'; }
    const { cidade, latitude, longitude } = params || {};
    const lat = Number(latitude), lng = Number(longitude);
    if (!lat || !lng) return 'LOCALIZACAO_FALTANDO: peça a localização ao cliente.';
    const regiao = mapa.find(m => m.tipo === 'regiao' && dentroDe(lat, lng, m.poly));
    const inviavel = mapa.find(m => m.tipo === 'inviavel' && dentroDe(lat, lng, m.poly));
    return JSON.stringify({ cidade, regiao: regiao ? regiao.nome : null, area_inviavel: inviavel ? inviavel.nome : null });
})();
