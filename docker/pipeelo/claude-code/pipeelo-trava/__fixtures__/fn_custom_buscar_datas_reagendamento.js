const KB_AREAS = '00000000-0000-4000-8000-00000000000a';
const P = String(environments.PIPEELO_API_URL || 'https://api.pipeelo.com').replace(/\/+$/, '');
const lerTabela = async () => {
    const r = await axios.get(`${P}/v1/knowledge-base/${KB_AREAS}`, { headers: { Authorization: `Bearer ${environments.PIPEELO_API_TOKEN}` }, validateStatus: () => true, timeout: 10000 });
    if (r.status !== 200) throw new Error(`tabela: HTTP ${r.status}`);
    return JSON.parse(r.data.data.context);
};
const acharOs = async (tabela, id_ordem_servico) => {
    const r = await axios.get(`${environments.ERP_URL}/ordens/${id_ordem_servico}`, { validateStatus: () => true });
    if (r.status !== 200 || !r.data) return { erro: 'OS_NAO_ENCONTRADA: confira o número com o cliente.' };
    const os = r.data;
    const idOs = os.id;
    const dia = String(os.data_programada || '').slice(0, 10);
    const agenda = tabela.agendas.find(a => a.id === os.agenda_id) || null;
    return { os, idOs, dia, agenda, horaInicio: os.hora_inicio, horaFim: os.hora_fim };
};
const vagasDaAgenda = async (agenda) => {
    const r = await axios.get(`${environments.ERP_URL}/agendas/${agenda.id}/vagas`, { validateStatus: () => true });
    return r.status === 200 ? r.data.dias || [] : [];
};
const buscarDatasReagendamento = async () => {
    let tabela;
    try { tabela = await lerTabela(); } catch (e) { return 'ERRO_TABELA_AREAS: NÃO ofereça data.'; }
    const achada = await acharOs(tabela, (params || {}).id_ordem_servico);
    if (achada.erro) return achada.erro;
    const livres = (await vagasDaAgenda(achada.agenda)).filter(d => d !== achada.dia);
    if (!livres.length) return 'SEM_VAGA: siga o fluxo padrão de transferência.';
    return `DATAS_DISPONIVEIS\n${livres.slice(0, 3).join('\n')}`;
};
return (async () => await buscarDatasReagendamento())();
