
/* =====================================================
   ESTADO GLOBAL E DETECÇÃO DE PÁGINA
===================================================== */

let modulos = [];
let moduloAtual = null;
let secaoAtual = 0;
let currentUser = null;

// Detectar qual página estamos
const isModuloPage = window.location.pathname.includes('modulo.html');
const isIndexPage = !isModuloPage && (window.location.pathname.includes('home.html') || window.location.pathname === '/' || window.location.pathname.endsWith('index.html'));

/* =====================================================
   TEMA (LIGHT/DARK)
===================================================== */

function configurarTema() {
    const temaSalvo = localStorage.getItem('theme') || 'light';
    aplicarTema(temaSalvo);
    
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', alternarTema);
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = temaSalvo === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
}

function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('theme', tema);
    
    const icon = document.querySelector('.theme-toggle i');
    if (icon) {
        icon.className = tema === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

function alternarTema() {
    const temaAtual = document.documentElement.getAttribute('data-theme');
    const novoTema = temaAtual === 'dark' ? 'light' : 'dark';
    aplicarTema(novoTema);
    mostrarToast(`Tema ${novoTema === 'dark' ? 'escuro' : 'claro'} ativado`);
}

/* =====================================================
   PÁGINA INICIAL (home.html)
===================================================== */

async function carregarModulos() {
    const container = document.getElementById('modules-container');
    if (!container) return;
    
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state__icon">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
            <div class="empty-state__title">Carregando módulos...</div>
            <p>Aguarde um momento</p>
        </div>
    `;
    
    try {
        const response = await fetch('dados/modulos.json');
        if (!response.ok) throw new Error('Erro ao carregar módulos');
        
        modulos = await response.json();
        
        // Sincronizar status com Firebase/localStorage
        let concluidos = JSON.parse(localStorage.getItem('modulosConcluidos') || '[]');
        
        modulos.forEach((m, index) => {
            if (concluidos.includes(m.id)) {
                m.status = 'concluido';
            } else if (index === 0 || (index > 0 && modulos[index-1].status === 'concluido')) {
                m.status = 'em_andamento';
            } else {
                m.status = 'bloqueado';
            }
        });

        renderizarModulos();
        atualizarProgresso();
    } catch (error) {
        console.error('Erro:', error);
        container.innerHTML = `<div class="empty-state">Erro ao carregar módulos.</div>`;
    }
}

// Funções de Sincronização Firebase
async function sincronizarComFirebase(user, db, doc, getDoc, setDoc) {
    if (!user) return;
    currentUser = user;
    const userRef = doc(db, "usuarios", user.uid);
    
    try {
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.progresso && data.progresso.modulosConcluidos) {
                // Mesclar com local
                let localConcluidos = JSON.parse(localStorage.getItem('modulosConcluidos') || '[]');
                let remoteConcluidos = data.progresso.modulosConcluidos;
                let merged = Array.from(new Set([...localConcluidos, ...remoteConcluidos]));
                
                localStorage.setItem('modulosConcluidos', JSON.stringify(merged));
                
                // Se houver diários salvos remotamente, poderíamos baixar aqui também
                if (data.diarios) {
                    for (let modId in data.diarios) {
                        localStorage.setItem(`diario_modulo_${modId}`, JSON.stringify(data.diarios[modId]));
                    }
                }
            }
        } else {
            // Criar documento se não existir (ex: login social primeira vez)
            await setDoc(userRef, {
                nome: user.displayName || "Usuário",
                email: user.email,
                criadoEm: new Date().toISOString(),
                progresso: { modulosConcluidos: [] }
            });
        }
        
        // Se estiver na home, recarregar módulos com dados novos
        if (isIndexPage) carregarModulos();
        // Se estiver no módulo, verificar requisitos
        if (isModuloPage) verificarRequisitosConclusao();
        
    } catch (e) {
        console.error("Erro na sincronização:", e);
    }
}

async function salvarProgressoFirebase(moduloId) {
    if (!currentUser) return;
    
    // Usar import dinâmico ou assumir que as ferramentas estão disponíveis globalmente se injetadas
    // Como estamos em um ambiente de módulos, precisamos que as funções sejam passadas ou importadas
    // Vou adicionar um evento customizado ou usar uma referência global
    window.dispatchEvent(new CustomEvent('salvarProgresso', { detail: { moduloId } }));
}

function renderizarModulos() {
    const container = document.getElementById('modules-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    modulos.forEach(modulo => {
        const card = document.createElement('div');
        card.className = 'card module-card card--interactive';
        
        const isBloqueado = modulo.status === 'bloqueado';
        const statusClass = `module-status--${modulo.status}`;
        
        card.innerHTML = `
            <div class="module-header">
                <div class="module-icon">
                    <i class="${modulo.icone}"></i>
                </div>
                <div class="module-title-container">
                    <h3 class="module-title">${modulo.titulo}</h3>
                    <p class="module-subtitle">${modulo.subtitulo}</p>
                </div>
                <span class="module-status ${statusClass}">
                    ${modulo.status === 'em_andamento' ? 'Em andamento' : 
                      modulo.status === 'bloqueado' ? 'Bloqueado' : 'Concluído'}
                </span>
            </div>
            <p class="module-description">${modulo.descricao}</p>
            <div class="module-footer">
                <div class="module-meta">
                    <span class="meta-item"><i class="far fa-clock"></i> ${modulo.duracao}</span>
                    <span class="meta-item"><i class="fas fa-book-bible"></i> ${modulo.versiculoChave}</span>
                </div>
                <button class="btn ${isBloqueado ? 'btn--ghost' : 'btn--primary'} btn-abrir-modulo">
                    ${isBloqueado ? '<i class="fas fa-lock"></i> Bloqueado' : '<i class="fas fa-play"></i> Iniciar módulo'}
                </button>
            </div>
        `;
        
        if (!isBloqueado) {
            card.querySelector('.btn-abrir-modulo').addEventListener('click', () => {
                localStorage.setItem('moduloSelecionado', JSON.stringify(modulo));
                window.location.href = 'modulo.html';
            });
        }
        
        container.appendChild(card);
    });
}

function atualizarProgresso() {
    const concluidos = JSON.parse(localStorage.getItem('modulosConcluidos') || '[]');
    const total = modulos.length;
    const porcentagem = total > 0 ? (concluidos.length / total) * 100 : 0;
    
    const progressFill = document.getElementById('progress-fill');
    const completedCount = document.getElementById('completed-count');
    const totalModules = document.getElementById('total-modules');
    
    if (progressFill) {
        progressFill.style.width = `${porcentagem}%`;
        progressFill.textContent = `${Math.round(porcentagem)}%`;
    }
    if (completedCount) completedCount.textContent = concluidos.length;
    if (totalModules) totalModules.textContent = total;
}

/* =====================================================
   PÁGINA DO MÓDULO (modulo.html)
===================================================== */

async function inicializarPaginaModulo() {
    configurarTema();
    // Carregar lista de módulos primeiro para navegação
    try {
        const response = await fetch('dados/modulos.json');
        modulos = await response.json();
    } catch (e) { console.error("Erro ao carregar lista de módulos", e); }
    
    await carregarModuloAtual();
    configurarDiario();
    configurarMenuMobile();
    verificarRequisitosConclusao();
    
    // Corrigir link "Minha Jornada do Discípulo" na sidebar
    const diarioLink = document.querySelector('.diario-link');
    if (diarioLink) {
        diarioLink.addEventListener('click', (e) => {
            e.preventDefault();
            abrirDiario();
            if (window.innerWidth <= 1024) {
                document.querySelector('.modulo-sidebar')?.classList.remove('active');
            }
        });
    }
}

async function carregarModuloAtual() {
    const moduloSalvo = localStorage.getItem('moduloSelecionado');
    if (!moduloSalvo) {
        window.location.href = 'home.html';
        return;
    }
    
    moduloAtual = JSON.parse(moduloSalvo);
    document.title = `${moduloAtual.titulo} - Hagios`;
    
    const tituloElement = document.getElementById('modulo-title');
    if (tituloElement) tituloElement.textContent = moduloAtual.titulo;
    
    try {
        const response = await fetch(`dados/modulo${moduloAtual.id}.json`);
        const dadosModulo = await response.json();
        moduloAtual = { ...moduloAtual, ...dadosModulo };
        
        renderizarSidebar();
        carregarSecao(0);
        renderizarQuiz();
        configurarBotaoConclusao();
    } catch (error) {
        console.error('Erro ao carregar conteúdo:', error);
        mostrarErroModulo();
    }
}

function renderizarQuiz() {
    const quizContent = document.getElementById('quiz-content');
    if (!quizContent || !moduloAtual.quiz) return;

    let html = `<h4>${moduloAtual.quiz.titulo}</h4>`;
    html += `<ol class="quiz-questions">`;
    
    moduloAtual.quiz.perguntas.forEach((q, index) => {
        html += `
            <li>
                <p><strong>${q.pergunta}</strong></p>
                ${q.opcoes.map(opt => `
                    <label><input type="radio" name="${q.id}" value="${opt.id}"> ${opt.texto}</label><br>
                `).join('')}
            </li>
        `;
    });
    
    html += `</ol>`;
    quizContent.innerHTML = html;
}

function renderizarSidebar() {
    const sidebarMenu = document.getElementById('sidebar-menu');
    if (!sidebarMenu || !moduloAtual.secoes) return;
    
    sidebarMenu.innerHTML = '';
    moduloAtual.secoes.forEach((secao, index) => {
        const li = document.createElement('li');
        li.className = 'sidebar-item';
        li.innerHTML = `
            <a href="#" class="sidebar-link ${index === 0 ? 'active' : ''}" data-index="${index}">
                <span class="sidebar-icon"><i class="fas fa-chevron-right"></i></span>
                <span class="sidebar-text">${secao.titulo}</span>
            </a>
        `;
        li.querySelector('.sidebar-link').addEventListener('click', (e) => {
            e.preventDefault();
            carregarSecao(index);
            atualizarMenuAtivo(index);
        });
        sidebarMenu.appendChild(li);
    });
}

function carregarSecao(index) {
    if (!moduloAtual || !moduloAtual.secoes || !moduloAtual.secoes[index]) return;
    
    secaoAtual = index;
    const secao = moduloAtual.secoes[index];
    const contentElement = document.getElementById('modulo-content');
    if (!contentElement) return;
    
    const isUltimaSecao = index === moduloAtual.secoes.length - 1;
    
    contentElement.innerHTML = `
        <div class="section-header">
            <h2 class="section-title">${secao.titulo}</h2>
            <span class="section-number">${index + 1}/${moduloAtual.secoes.length}</span>
        </div>
        <div class="section-content">${secao.conteudo}</div>
        <div class="section-navigation">
            ${index > 0 ? `<button class="btn btn--ghost btn-secao-prev"><i class="fas fa-arrow-left"></i> Anterior</button>` : ''}
            ${!isUltimaSecao ? 
                `<button class="btn btn--primary btn-secao-next">Próxima <i class="fas fa-arrow-right"></i></button>` : 
                `<button class="btn btn--accent btn-abrir-final"><i class="fas fa-pen-fancy"></i> Abrir Diário e Quiz</button>`}
        </div>
    `;
    
    contentElement.querySelector('.btn-secao-prev')?.addEventListener('click', () => carregarSecao(index - 1));
    contentElement.querySelector('.btn-secao-next')?.addEventListener('click', () => carregarSecao(index + 1));
    contentElement.querySelector('.btn-abrir-final')?.addEventListener('click', abrirDiario);

    renderizarRodapeModulo();
}

function renderizarRodapeModulo() {
    const prevBtn = document.getElementById('btn-prev-modulo');
    const nextBtn = document.getElementById('btn-next-modulo');

    if (prevBtn) {
        if (moduloAtual.moduloAnterior) {
            prevBtn.style.display = 'flex';
            prevBtn.onclick = () => {
                const prevMod = modulos.find(m => m.id === moduloAtual.moduloAnterior);
                if (prevMod) {
                    localStorage.setItem('moduloSelecionado', JSON.stringify(prevMod));
                    window.location.reload();
                }
            };
        } else {
            prevBtn.style.display = 'none';
        }
    }

    if (nextBtn) {
        if (moduloAtual.proximoModulo) {
            const concluidos = JSON.parse(localStorage.getItem('modulosConcluidos') || '[]');
            const isProximoBloqueado = !concluidos.includes(moduloAtual.id);
            
            nextBtn.style.display = 'flex';
            if (isProximoBloqueado) {
                nextBtn.classList.add('btn-nav--locked');
                nextBtn.innerHTML = `Próximo Módulo <i class="fas fa-lock"></i>`;
                nextBtn.onclick = () => mostrarToast('Conclua este módulo para liberar o próximo', 'info');
            } else {
                nextBtn.classList.remove('btn-nav--locked');
                nextBtn.innerHTML = `Próximo Módulo <i class="fas fa-arrow-right"></i>`;
                nextBtn.onclick = () => {
                    const nextMod = modulos.find(m => m.id === moduloAtual.proximoModulo);
                    if (nextMod) {
                        localStorage.setItem('moduloSelecionado', JSON.stringify(nextMod));
                        window.location.reload();
                    }
                };
            }
        } else {
            nextBtn.style.display = 'none';
        }
    }
}

function atualizarMenuAtivo(index) {
    document.querySelectorAll('.sidebar-link').forEach((link, i) => {
        link.classList.toggle('active', i === index);
    });
}

function configurarDiario() {
    carregarDiarioSalvo();
    document.getElementById('btn-close-diario')?.addEventListener('click', fecharDiario);
    document.getElementById('btn-save-diario')?.addEventListener('click', salvarDiario);
    document.getElementById('btn-clear-diario')?.addEventListener('click', limparDiario);
    document.getElementById('btn-calcular-quiz')?.addEventListener('click', calcularQuiz);
}

function abrirDiario() {
    document.getElementById('modulo-diario').classList.add('active');
    document.getElementById('modulo-content').classList.add('hidden');
}

function fecharDiario() {
    document.getElementById('modulo-diario').classList.remove('active');
    document.getElementById('modulo-content').classList.remove('hidden');
}

function carregarDiarioSalvo() {
    const dados = localStorage.getItem(`diario_modulo_${moduloAtual.id}`);
    if (!dados) return;
    const respostas = JSON.parse(dados);
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`diario-pergunta${i}`);
        if (el) el.value = respostas[`p${i}`] || '';
    }
    const quizPontuacao = document.getElementById('quiz-pontuacao');
    if (quizPontuacao && respostas.quizPorcentagem) {
        quizPontuacao.dataset.porcentagem = respostas.quizPorcentagem;
        const resultado = document.getElementById('quiz-resultado');
        resultado.style.display = 'block';
        resultado.textContent = `Último resultado: ${respostas.quizPorcentagem}%`;
    }
    const desafioCheck = document.getElementById('desafio-completado');
    if (desafioCheck) desafioCheck.checked = respostas.desafioCompletado || false;
    const desafioReflexao = document.getElementById('desafio-reflexao');
    if (desafioReflexao) desafioReflexao.value = respostas.reflexaoDesafio || '';
}

function calcularQuiz() {
    if (!moduloAtual.quiz) return;
    
    const perguntas = moduloAtual.quiz.perguntas;
    let acertos = 0;
    
    perguntas.forEach(q => {
        const selecionada = document.querySelector(`input[name="${q.id}"]:checked`)?.value;
        if (selecionada === q.correta) acertos++;
    });
    
    const porcentagem = Math.round((acertos / perguntas.length) * 100);
    const minimo = moduloAtual.quiz.minimoAprovacao || 70;
    const resultado = document.getElementById('quiz-resultado');
    const pontuacaoEl = document.getElementById('quiz-pontuacao');
    
    resultado.style.display = 'block';
    pontuacaoEl.dataset.porcentagem = porcentagem;
    
    if (porcentagem >= minimo) {
        resultado.style.color = 'var(--color-success)';
        resultado.textContent = `Parabéns! ${porcentagem}% de acertos.`;
    } else {
        resultado.style.color = 'var(--color-error)';
        resultado.textContent = `${porcentagem}% - Tente novamente (Mínimo ${minimo}%).`;
    }
    verificarRequisitosConclusao();
}

function salvarDiario() {
    const respostas = {
        p1: document.getElementById('diario-pergunta1').value,
        p2: document.getElementById('diario-pergunta2').value,
        p3: document.getElementById('diario-pergunta3').value,
        p4: document.getElementById('diario-pergunta4').value,
        quizPorcentagem: document.getElementById('quiz-pontuacao').dataset.porcentagem,
        desafioCompletado: document.getElementById('desafio-completado').checked,
        reflexaoDesafio: document.getElementById('desafio-reflexao').value
    };
    localStorage.setItem(`diario_modulo_${moduloAtual.id}`, JSON.stringify(respostas));
    mostrarToast('Diário salvo!', 'success');
    verificarRequisitosConclusao();
    
    // Sincronizar com Firebase
    window.dispatchEvent(new CustomEvent('salvarDiarioFirebase', { 
        detail: { moduloId: moduloAtual.id, dados: respostas } 
    }));
}

function limparDiario() {
    if (confirm('Limpar diário?')) {
        for (let i = 1; i <= 4; i++) document.getElementById(`diario-pergunta${i}`).value = '';
        localStorage.removeItem(`diario_modulo_${moduloAtual.id}`);
        verificarRequisitosConclusao();
    }
}

function verificarRequisitosConclusao() {
    const btn = document.getElementById('btn-mark-complete');
    if (!btn) return;

    const dados = JSON.parse(localStorage.getItem(`diario_modulo_${moduloAtual.id}`) || '{}');
    const quizOk = parseInt(dados.quizPorcentagem || '0') >= 70;
    const desafioOk = dados.desafioCompletado === true;
    const textosOk = [dados.p1, dados.p2, dados.p3, dados.p4].every(t => t && t.length > 5);

    if (quizOk && desafioOk && textosOk) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Concluir Módulo';
        btn.classList.add('btn--success');
    } else {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-lock"></i> Complete tudo para concluir';
        btn.classList.remove('btn--success');
    }
}

function configurarBotaoConclusao() {
    const btn = document.getElementById('btn-mark-complete');
    if (!btn) return;

    const concluidos = JSON.parse(localStorage.getItem('modulosConcluidos') || '[]');
    if (concluidos.includes(moduloAtual.id)) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-check"></i> Módulo Concluído';
        return;
    }

    btn.addEventListener('click', () => {
        const concluidos = JSON.parse(localStorage.getItem('modulosConcluidos') || '[]');
        if (!concluidos.includes(moduloAtual.id)) {
            concluidos.push(moduloAtual.id);
            localStorage.setItem('modulosConcluidos', JSON.stringify(concluidos));
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-check"></i> Módulo Concluído';
            mostrarToast('Módulo concluído! Próximo desbloqueado.', 'success');
            
            // Sincronizar com Firebase
            salvarProgressoFirebase(moduloAtual.id);
        }
    });
}

function configurarMenuMobile() {
    const toggle = document.querySelector('.sidebar-toggle');
    const closeBtn = document.querySelector('.sidebar-close');
    const sidebar = document.querySelector('.modulo-sidebar');
    
    toggle?.addEventListener('click', () => sidebar.classList.add('active'));
    closeBtn?.addEventListener('click', () => sidebar.classList.remove('active'));
    
    // Fechar ao clicar em um link (opcional, mas recomendado para mobile)
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('active');
            }
        });
    });
}

function mostrarToast(msg, tipo) {
    let toast = document.querySelector('.toast') || document.createElement('div');
    toast.className = `toast toast--${tipo} show`;
    toast.innerHTML = msg;
    if (!document.querySelector('.toast')) document.body.appendChild(toast);
    setTimeout(() => toast.classList.remove('show'), 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    if (isModuloPage) inicializarPaginaModulo();
    else if (isIndexPage) carregarModulos();
});
