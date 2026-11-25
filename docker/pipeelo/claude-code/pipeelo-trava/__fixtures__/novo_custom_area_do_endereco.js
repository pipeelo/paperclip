const KB_AREAS = '00000000-0000-4000-8000-00000000000a';
const P = String(environments.PIPEELO_API_URL || 'https://api.pipeelo.com').replace(/\/+$/, '');
const lerAreas = async () => {
    const r = await axios.get(`${P}/v1/knowledge-base/${KB_AREAS}`, { headers: { Authorization: `Bearer ${environments.PIPEELO_API_TOKEN}` }, validateStatus: () => true, timeout: 10000 });
    if (r.status !== 200) throw new Error(`areas: HTTP ${r.status}`);
    return JSON.parse(r.data.data.context);
};
const selecionar = async ({ cidade, bairro }) => {
    let areas;
    try { areas = await lerAreas(); } catch (e) { return { codigo: 'ERRO_TABELA_AREAS' }; }
    const agenda = areas.agendas.find(a => a.cidade === cidade && a.bairros.includes(bairro));
    if (!agenda) return { codigo: 'FORA_DO_PILOTO' };
    return { agenda: agenda.id, bairro, porLocalizacao: false };
};
return (async () => {
    const r = await selecionar(params || {});
    if (r.codigo === 'ERRO_TABELA_AREAS') return 'ERRO_TABELA_AREAS: transfira para o setor humano.';
    if (r.codigo) return 'FORA_DO_PILOTO: siga o fluxo padrão.';
    return JSON.stringify({ agenda: r.agenda, bairro: r.bairro, pela_localizacao: r.porLocalizacao });
})();
