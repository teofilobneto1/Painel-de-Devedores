import {
    initializeApp
  } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

  import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    runTransaction
  } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

  import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
  } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";


  /* =====================================================
     CONFIGURAÇÃO
     ===================================================== */

  const firebaseConfig = {

    apiKey:
      "AIzaSyCLOoAlrc0MSXZyWd02jj4bsmhdE7MOSpA",

    authDomain:
      "dadal-tailandesa.firebaseapp.com",

    projectId:
      "dadal-tailandesa",

    storageBucket:
      "dadal-tailandesa.firebasestorage.app",

    messagingSenderId:
      "742144155573",

    appId:
      "1:742144155573:web:506b7902e8eb9c0bd0c3fc"

  };


  const app =
    initializeApp(firebaseConfig);

  const db =
    getFirestore(app);

  const auth =
    getAuth(app);


  /* =====================================================
     UTILITÁRIOS
     ===================================================== */

  function dinheiro(valor) {

    return Number(valor || 0).toLocaleString(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL"
      }
    );

  }


  function numero(valor) {

    return Number(valor || 0);

  }


  function escaparHTML(valor) {

    return String(valor ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  }


  function timestampParaData(timestamp) {

    if (!timestamp) {
      return null;
    }

    if (typeof timestamp.toDate === "function") {
      return timestamp.toDate();
    }

    if (timestamp instanceof Date) {
      return timestamp;
    }

    return null;

  }


  function formatarData(timestamp) {

    const data =
      timestampParaData(timestamp);

    if (!data) {
      return "Agora";
    }

    return data.toLocaleString(
      "pt-BR"
    );

  }


  function dataInicioPeriodo(tipo) {

    if (tipo === "todos") {
      return null;
    }

    const agora =
      new Date();

    agora.setDate(
      agora.getDate() - 30
    );

    return agora;

  }


  /* =====================================================
     PARCELAMENTO / DEVEDORES
     ===================================================== */

  let parcelasCache = [];

  function dataLocalISO(data) {

    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");

    return `${ano}-${mes}-${dia}`;

  }

 function dataISOParaDate(valor) {

  if (!valor) {
    return new Date();
  }

  // Se já for Date
  if (valor instanceof Date) {
    return valor;
  }

  // Se for Timestamp do Firebase
  if (
    typeof valor === "object" &&
    typeof valor.toDate === "function"
  ) {
    return valor.toDate();
  }

  // Se for objeto com seconds
  if (
    typeof valor === "object" &&
    typeof valor.seconds === "number"
  ) {
    return new Date(valor.seconds * 1000);
  }

  // Se for texto
  if (typeof valor === "string") {

    const partes = valor.split("-").map(Number);

    if (partes.length === 3) {
      return new Date(
        partes[0],
        partes[1] - 1,
        partes[2]
      );
    }

    const data = new Date(valor);

    if (!isNaN(data.getTime())) {
      return data;
    }
  }

  // Se for número
  if (typeof valor === "number") {
    return new Date(valor);
  }

  console.warn(
    "Data em formato não reconhecido:",
    valor
  );

  return new Date();
}

  function adicionarMeses(data, meses) {

    const resultado = new Date(data);
    const diaOriginal = resultado.getDate();

    resultado.setDate(1);
    resultado.setMonth(resultado.getMonth() + meses);

    const ultimoDia = new Date(
      resultado.getFullYear(),
      resultado.getMonth() + 1,
      0
    ).getDate();

    resultado.setDate(Math.min(diaOriginal, ultimoDia));

    return resultado;

  }

  function formatarDataSimples(valor) {

    if (!valor) {
      return "—";
    }

    const data = valor instanceof Date
      ? valor
      : dataISOParaDate(valor);

    return data.toLocaleDateString("pt-BR");

  }

  function statusParcela(parcela) {

    if (parcela.status === "Pago") {
      return "Pago";
    }

    const vencimento = parcela.vencimento instanceof Date
      ? parcela.vencimento
      : timestampParaData(parcela.vencimento);

    if (vencimento && vencimento < new Date()) {
      return "Atrasada";
    }

    return "Pendente";

  }

  async function buscarParcelas() {

    const consulta = await getDocs(
      collection(db, "parcelas")
    );

    parcelasCache = consulta.docs.map(function(documento) {

      return {
        id: documento.id,
        ...documento.data()
      };

    });

    parcelasCache.sort(function(a, b) {

      const dataA = timestampParaData(a.criadoEm)?.getTime() || 0;
      const dataB = timestampParaData(b.criadoEm)?.getTime() || 0;

      return dataB - dataA;

    });

    return parcelasCache;

  }

  async function marcarParcelaPaga(id) {

    const parcela = parcelasCache.find(function(item) {
      return item.id === id;
    });

    if (!parcela || parcela.status === "Pago") {
      return;
    }

    const confirmar = confirm(
      `Marcar a parcela ${parcela.numeroParcela} de ${parcela.totalParcelas} como paga?`
    );

    if (!confirmar) {
      return;
    }

    try {

      await updateDoc(
        doc(db, "parcelas", id),
        {
          status: "Pago",
          pagoEm: serverTimestamp()
        }
      );

      alert("Parcela marcada como paga!");

      await atualizarTudo();

    } catch (erro) {

      console.error(erro);
      alert("Erro ao marcar a parcela como paga.");

    }

  }

  window.marcarParcelaPaga = marcarParcelaPaga;

  async function carregarDevedores() {

    const resumo = document.getElementById("resumo-devedores");
    const area = document.getElementById("lista-devedores");

    if (!resumo || !area) {
      return;
    }

    try {

      const parcelas = await buscarParcelas();
      const pendentes = parcelas.filter(function(parcela) {
        return parcela.status !== "Pago";
      });

      const clientes = {};

      pendentes.forEach(function(parcela) {

        const chave = (parcela.cliente || "Cliente não informado").trim().toLowerCase();

        if (!clientes[chave]) {
          clientes[chave] = {
            cliente: parcela.cliente || "Cliente não informado",
            telefone: parcela.telefone || "",
            parcelas: [],
            total: 0
          };
        }

        clientes[chave].parcelas.push(parcela);
        clientes[chave].total += numero(parcela.valor);

      });

      const lista = Object.values(clientes).sort(function(a, b) {
        return b.total - a.total;
      });

      const totalAberto = pendentes.reduce(function(soma, parcela) {
        return soma + numero(parcela.valor);
      }, 0);

      const clientesDevedores = lista.length;

      const atrasadas = pendentes.filter(function(parcela) {
        return statusParcela(parcela) === "Atrasada";
      }).length;

      resumo.innerHTML = `
        <div class="resumo-dividas">
          <div class="indicador">
            <small>Total em aberto</small>
            <strong class="negativo">${dinheiro(totalAberto)}</strong>
          </div>
          <div class="indicador">
            <small>Clientes devedores</small>
            <strong>${clientesDevedores}</strong>
          </div>
          <div class="indicador">
            <small>Parcelas atrasadas</small>
            <strong class="negativo">${atrasadas}</strong>
          </div>
        </div>
      `;

      if (!lista.length) {
        area.innerHTML = `<p class="vazio">Nenhum cliente com parcelas em aberto.</p>`;
        return;
      }

      area.innerHTML = lista.map(function(devedor) {

        const contato = devedor.telefone
          ? `WhatsApp/telefone: ${escaparHTML(devedor.telefone)}`
          : "Telefone não informado";

        const parcelasHTML = devedor.parcelas
          .sort(function(a, b) {
            return numero(a.numeroParcela) - numero(b.numeroParcela);
          })
          .map(function(parcela) {

            const status = statusParcela(parcela);
            const classe = status === "Pago"
              ? "status-paga"
              : status === "Atrasada"
                ? "status-atrasada"
                : "status-pendente";

            return `
              <div class="parcela-item">
                <div class="parcela-info">
                  <strong>Parcela ${numero(parcela.numeroParcela)} de ${numero(parcela.totalParcelas)}</strong>
                  <small>${escaparHTML(parcela.produtoNome || "Venda")} — Vencimento: ${formatarDataSimples(parcela.vencimento)}</small>
                  <span class="status-parcela ${classe}">${status}</span>
                </div>
                <div>
                  <strong>${dinheiro(parcela.valor)}</strong>
                  <button class="btn-pagar" type="button" onclick="marcarParcelaPaga('${parcela.id}')">
                    Marcar como paga
                  </button>
                </div>
              </div>
            `;

          }).join("");

        return `
          <div class="devedor-card">
            <div class="devedor-topo">
              <div>
                <h4>${escaparHTML(devedor.cliente)}</h4>
                <span class="status">${contato}</span>
              </div>
              <div class="devedor-valor">${dinheiro(devedor.total)}</div>
            </div>
            ${parcelasHTML}
          </div>
        `;

      }).join("");

    } catch (erro) {

      console.error(erro);
      resumo.innerHTML = "";
      area.innerHTML = `<p class="vazio">Erro ao carregar os devedores.</p>`;

    }

  }


  /* =====================================================
     LOGIN
     ===================================================== */

  const loginArea =
    document.getElementById(
      "login-area"
    );

  const painel =
    document.getElementById(
      "painel"
    );

  const formularioLogin =
    document.getElementById(
      "form-login"
    );

  const btnLogin =
    document.getElementById(
      "btn-login"
    );

  const erroLogin =
    document.getElementById(
      "erro-login"
    );

  const btnSair =
    document.getElementById(
      "btn-sair"
    );


  onAuthStateChanged(
    auth,
    async function(usuario) {

      if (usuario) {

        loginArea.style.display =
          "none";

        painel.style.display =
          "block";

        await atualizarTudo();

      } else {

        loginArea.style.display =
          "flex";

        painel.style.display =
          "none";

      }

    }
  );


  formularioLogin.addEventListener(
    "submit",
    async function(evento) {

      evento.preventDefault();

      const email =
        document
          .getElementById("email")
          .value
          .trim();

      const senha =
        document
          .getElementById("senha")
          .value;

      btnLogin.disabled =
        true;

      btnLogin.textContent =
        "Entrando...";

      erroLogin.style.display =
        "none";

      try {

        await signInWithEmailAndPassword(
          auth,
          email,
          senha
        );

      } catch (erro) {

        console.error(erro);

        erroLogin.textContent =
          "E-mail ou senha incorretos.";

        erroLogin.style.display =
          "block";

      }

      btnLogin.disabled =
        false;

      btnLogin.textContent =
        "Entrar";

    }
  );


  btnSair.addEventListener(
    "click",
    async function() {

      await signOut(auth);

    }
  );


  /* =====================================================
     NAVEGAÇÃO
     ===================================================== */

  document
    .querySelectorAll(".admin-nav button")
    .forEach(function(botao) {

      botao.addEventListener(
        "click",
        function() {

          const secao =
            botao.dataset.secao;

          document
            .querySelectorAll(
              ".admin-nav button"
            )
            .forEach(function(item) {

              item.classList.remove(
                "ativo"
              );

            });

          botao.classList.add(
            "ativo"
          );

          document
            .querySelectorAll(
              ".secao-admin"
            )
            .forEach(function(item) {

              item.classList.remove(
                "ativa"
              );

            });

          const destino =
            document.getElementById(
              `secao-${secao}`
            );

          if (destino) {

            destino.classList.add(
              "ativa"
            );

          }

        }
      );

    });


  /* =====================================================
     IMAGEM
     ===================================================== */

  function comprimirImagem(
    arquivo,
    callback
  ) {

    const leitor =
      new FileReader();

    leitor.onload =
      function(evento) {

        const imagem =
          new Image();

        imagem.onload =
          function() {

            const canvas =
              document.createElement(
                "canvas"
              );

            const tamanhoMaximo =
              1000;

            let largura =
              imagem.width;

            let altura =
              imagem.height;

            if (
              largura > tamanhoMaximo ||
              altura > tamanhoMaximo
            ) {

              if (largura > altura) {

                altura =
                  Math.round(
                    altura *
                    tamanhoMaximo /
                    largura
                  );

                largura =
                  tamanhoMaximo;

              } else {

                largura =
                  Math.round(
                    largura *
                    tamanhoMaximo /
                    altura
                  );

                altura =
                  tamanhoMaximo;

              }

            }

            canvas.width =
              largura;

            canvas.height =
              altura;

            const contexto =
              canvas.getContext(
                "2d"
              );

            contexto.drawImage(
              imagem,
              0,
              0,
              largura,
              altura
            );

            const resultado =
              canvas.toDataURL(
                "image/jpeg",
                0.70
              );

            callback(resultado);

          };

        imagem.src =
          evento.target.result;

      };

    leitor.readAsDataURL(
      arquivo
    );

  }


  /* =====================================================
     CADASTRO
     ===================================================== */

  const campoImagem =
    document.getElementById(
      "imagem"
    );

  const preview =
    document.getElementById(
      "preview"
    );

  const imagemPreview =
    document.getElementById(
      "imagem-preview"
    );

  const formulario =
    document.getElementById(
      "form-produto"
    );

  const aviso =
    document.getElementById(
      "aviso"
    );

  const estoque =
    document.getElementById(
      "estoque"
    );

  const statusEstoque =
    document.getElementById(
      "status-estoque"
    );

  const botaoCadastrar =
    document.getElementById(
      "btn-cadastrar"
    );

  let imagemComprimida =
    "";


  function atualizarStatusEstoqueCadastro() {

    const quantidade =
      numero(estoque.value);

    const minimo =
      numero(
        document.getElementById(
          "estoque-minimo"
        ).value
      );

    if (quantidade <= 0) {

      statusEstoque.textContent =
        "Esgotado";

      statusEstoque.style.color =
        "#b3261e";

    } else if (
      quantidade <= minimo
    ) {

      statusEstoque.textContent =
        "Estoque baixo";

      statusEstoque.style.color =
        "#9a7100";

    } else {

      statusEstoque.textContent =
        "Disponível";

      statusEstoque.style.color =
        "#26733a";

    }

  }


  estoque.addEventListener(
    "input",
    atualizarStatusEstoqueCadastro
  );

  document
    .getElementById("estoque-minimo")
    .addEventListener(
      "input",
      atualizarStatusEstoqueCadastro
    );


  campoImagem.addEventListener(
    "change",
    function() {

      const arquivo =
        campoImagem.files[0];

      if (!arquivo) {

        preview.style.display =
          "none";

        imagemComprimida =
          "";

        return;

      }

      comprimirImagem(
        arquivo,
        function(resultado) {

          imagemComprimida =
            resultado;

          imagemPreview.src =
            resultado;

          preview.style.display =
            "block";

        }
      );

    }
  );


  formulario.addEventListener(
    "submit",
    async function(evento) {

      evento.preventDefault();

      if (!imagemComprimida) {

        alert(
          "Escolha uma imagem."
        );

        return;

      }

      const quantidade =
        numero(
          document.getElementById(
            "estoque"
          ).value
        );

      const custo =
        numero(
          document.getElementById(
            "custo"
          ).value
        );

      const preco =
        numero(
          document.getElementById(
            "preco"
          ).value
        );

      const estoqueMinimo =
        numero(
          document.getElementById(
            "estoque-minimo"
          ).value
        );

      if (
        custo < 0 ||
        preco < 0 ||
        quantidade < 0 ||
        estoqueMinimo < 0
      ) {

        alert(
          "Os valores não podem ser negativos."
        );

        return;

      }

      const produto = {

        nome:
          document
            .getElementById("nome")
            .value
            .trim(),

        marca:
          document
            .getElementById("marca")
            .value
            .trim(),

        custo:
          custo,

        preco:
          preco,

        estoque:
          quantidade,

        estoqueMinimo:
          estoqueMinimo,

        ml:
          numero(
            document.getElementById(
              "ml"
            ).value
          ),

        categoria:
          document
            .getElementById(
              "categoria"
            )
            .value,

        descricao:
          document
            .getElementById(
              "descricao"
            )
            .value
            .trim(),

        imagem:
          imagemComprimida,

        status:
          quantidade <= 0
            ? "Esgotado"
            : quantidade <= estoqueMinimo
              ? "Estoque baixo"
              : "Disponível",

        criadoEm:
          serverTimestamp()

      };


      try {

        botaoCadastrar.disabled =
          true;

        botaoCadastrar.textContent =
          "Cadastrando...";

        await addDoc(
          collection(
            db,
            "produtos"
          ),
          produto
        );

        aviso.style.display =
          "block";

        aviso.style.background =
          "#eef8f0";

        aviso.style.color =
          "#26733a";

        aviso.textContent =
          "Produto cadastrado com sucesso!";

        formulario.reset();

        preview.style.display =
          "none";

        imagemComprimida =
          "";

        statusEstoque.textContent =
          "Disponibilidade será definida pelo estoque.";

        statusEstoque.style.color =
          "#666";

        await atualizarTudo();

      } catch (erro) {

        console.error(erro);

        aviso.style.display =
          "block";

        aviso.style.background =
          "#fdecec";

        aviso.style.color =
          "#a12626";

        aviso.textContent =
          "Erro ao cadastrar produto.";

      }

      botaoCadastrar.disabled =
        false;

      botaoCadastrar.textContent =
        "Cadastrar produto";

    }
  );


  /* =====================================================
     PRODUTOS
     ===================================================== */

  let produtosCache =
    [];


  async function buscarProdutos() {

    const consulta =
      await getDocs(
        collection(
          db,
          "produtos"
        )
      );

    produtosCache =
      consulta.docs.map(
        function(documento) {

          return {
            id: documento.id,
            ...documento.data()
          };

        }
      );

    return produtosCache;

  }


  function calcularStatusProduto(produto) {

    const estoqueAtual =
      numero(produto.estoque);

    const minimo =
      numero(
        produto.estoqueMinimo ?? 2
      );

    if (estoqueAtual <= 0) {
      return "Esgotado";
    }

    if (estoqueAtual <= minimo) {
      return "Estoque baixo";
    }

    return "Disponível";

  }


  async function carregarProdutos() {

    const lista =
      document.getElementById(
        "lista-produtos"
      );

    lista.innerHTML =
      "Carregando produtos...";

    try {

      const produtos =
        await buscarProdutos();

      if (!produtos.length) {

        lista.innerHTML =
          "<p class='vazio'>Nenhum produto cadastrado.</p>";

        return;

      }

      lista.innerHTML =
        "";

      produtos.sort(
        function(a, b) {

          return String(
            a.nome || ""
          ).localeCompare(
            String(
              b.nome || ""
            ),
            "pt-BR"
          );

        }
      );

      produtos.forEach(
        function(produto) {

          const card =
            document.createElement(
              "div"
            );

          card.className =
            "produto-admin";

          const status =
            calcularStatusProduto(
              produto
            );

          const classeStatus =
            status === "Esgotado"
              ? "status-esgotado"
              : status === "Estoque baixo"
                ? "status-baixo"
                : "status-disponivel";

          const custo =
            numero(
              produto.custo
            );

          const preco =
            numero(
              produto.preco
            );

          const lucro =
            preco - custo;

          card.innerHTML = `

            <img
              src="${escaparHTML(produto.imagem || "")}"
              alt="${escaparHTML(produto.nome || "Produto")}"
            >

            <span class="produto-status ${classeStatus}">
              ${escaparHTML(status)}
            </span>

            <h4>
              ${escaparHTML(produto.nome || "Sem nome")}
            </h4>

            <div class="marca">
              ${escaparHTML(produto.marca || "")}
            </div>

            <div class="produto-preco">
              Venda: ${dinheiro(preco)}
            </div>

            <div class="produto-info">

              <strong>Custo:</strong>
              ${dinheiro(custo)}

              <br>

              <strong>Estoque:</strong>
              ${numero(produto.estoque)}

              <br>

              <strong>Estoque mínimo:</strong>
              ${numero(produto.estoqueMinimo ?? 2)}

              <br>

              <strong>Volume:</strong>
              ${numero(produto.ml)} ml

              <br>

              <strong>Categoria:</strong>
              ${escaparHTML(produto.categoria || "")}

            </div>

            <div class="produto-lucro">
              Lucro por unidade: ${dinheiro(lucro)}
            </div>

            <div class="produto-acoes">

              <button
                class="btn-venda"
                data-venda="${escaparHTML(produto.id)}"
              >
                Registrar venda
              </button>

              <button
                class="btn-entrada"
                data-entrada="${escaparHTML(produto.id)}"
              >
                Registrar entrada
              </button>

              <button
                class="btn-editar"
                data-editar="${escaparHTML(produto.id)}"
              >
                Editar
              </button>

              <button
                class="btn-excluir"
                data-excluir="${escaparHTML(produto.id)}"
              >
                Excluir
              </button>

            </div>

          `;

          lista.appendChild(card);


          card
            .querySelector("[data-venda]")
            .addEventListener(
              "click",
              function() {

                abrirModalVenda(
                  produto
                );

              }
            );


          card
            .querySelector("[data-entrada]")
            .addEventListener(
              "click",
              function() {

                abrirModalEntrada(
                  produto
                );

              }
            );


          card
            .querySelector("[data-editar]")
            .addEventListener(
              "click",
              function() {

                abrirEdicao(
                  produto
                );

              }
            );


          card
            .querySelector("[data-excluir]")
            .addEventListener(
              "click",
              function() {

                excluirProduto(
                  produto.id,
                  produto.nome
                );

              }
            );

        }
      );

    } catch (erro) {

      console.error(erro);

      lista.innerHTML =
        "<p>Erro ao carregar produtos.</p>";

    }

  }


  /* =====================================================
     MODAL EDITAR
     ===================================================== */

  const modalEditar =
    document.getElementById(
      "modal-editar"
    );

  const formEditar =
    document.getElementById(
      "form-editar"
    );

  const btnCancelar =
    document.getElementById(
      "btn-cancelar"
    );

  let novaImagemEditada =
    "";


  function abrirEdicao(produto) {

    document.getElementById(
      "editar-id"
    ).value =
      produto.id;

    document.getElementById(
      "editar-nome"
    ).value =
      produto.nome || "";

    document.getElementById(
      "editar-marca"
    ).value =
      produto.marca || "";

    document.getElementById(
      "editar-custo"
    ).value =
      numero(produto.custo);

    document.getElementById(
      "editar-preco"
    ).value =
      numero(produto.preco);

    document.getElementById(
      "editar-estoque"
    ).value =
      numero(produto.estoque);

    document.getElementById(
      "editar-estoque-minimo"
    ).value =
      numero(
        produto.estoqueMinimo ?? 2
      );

    document.getElementById(
      "editar-ml"
    ).value =
      numero(produto.ml);

    document.getElementById(
      "editar-categoria"
    ).value =
      produto.categoria || "";

    document.getElementById(
      "editar-descricao"
    ).value =
      produto.descricao || "";

    const imagem =
      document.getElementById(
        "editar-imagem-preview"
      );

    if (produto.imagem) {

      imagem.src =
        produto.imagem;

      document.getElementById(
        "editar-preview"
      ).style.display =
        "block";

    } else {

      document.getElementById(
        "editar-preview"
      ).style.display =
        "none";

    }

    document.getElementById(
      "editar-imagem"
    ).value =
      "";

    novaImagemEditada =
      "";

    modalEditar.style.display =
      "block";

  }


  btnCancelar.addEventListener(
    "click",
    function() {

      modalEditar.style.display =
        "none";

    }
  );


  document.getElementById(
    "editar-imagem"
  ).addEventListener(
    "change",
    function() {

      const arquivo =
        this.files[0];

      if (!arquivo) {
        return;
      }

      comprimirImagem(
        arquivo,
        function(resultado) {

          novaImagemEditada =
            resultado;

          document.getElementById(
            "editar-imagem-preview"
          ).src =
            resultado;

          document.getElementById(
            "editar-preview"
          ).style.display =
            "block";

        }
      );

    }
  );


  formEditar.addEventListener(
    "submit",
    async function(evento) {

      evento.preventDefault();

      const id =
        document.getElementById(
          "editar-id"
        ).value;

      const quantidade =
        numero(
          document.getElementById(
            "editar-estoque"
          ).value
        );

      const minimo =
        numero(
          document.getElementById(
            "editar-estoque-minimo"
          ).value
        );

      const custo =
        numero(
          document.getElementById(
            "editar-custo"
          ).value
        );

      const preco =
        numero(
          document.getElementById(
            "editar-preco"
          ).value
        );

      if (
        quantidade < 0 ||
        minimo < 0 ||
        custo < 0 ||
        preco < 0
      ) {

        alert(
          "Os valores não podem ser negativos."
        );

        return;

      }

      const alteracoes = {

        nome:
          document.getElementById(
            "editar-nome"
          ).value.trim(),

        marca:
          document.getElementById(
            "editar-marca"
          ).value.trim(),

        custo:
          custo,

        preco:
          preco,

        estoque:
          quantidade,

        estoqueMinimo:
          minimo,

        ml:
          numero(
            document.getElementById(
              "editar-ml"
            ).value
          ),

        categoria:
          document.getElementById(
            "editar-categoria"
          ).value,

        descricao:
          document.getElementById(
            "editar-descricao"
          ).value.trim(),

        status:
          quantidade <= 0
            ? "Esgotado"
            : quantidade <= minimo
              ? "Estoque baixo"
              : "Disponível"

      };


      if (novaImagemEditada) {

        alteracoes.imagem =
          novaImagemEditada;

      }


      try {

        await updateDoc(
          doc(
            db,
            "produtos",
            id
          ),
          alteracoes
        );

        alert(
          "Produto atualizado com sucesso!"
        );

        modalEditar.style.display =
          "none";

        await atualizarTudo();

      } catch (erro) {

        console.error(erro);

        alert(
          "Erro ao atualizar o produto."
        );

      }

    }
  );


  /* =====================================================
     EXCLUIR
     ===================================================== */

  async function excluirProduto(
    id,
    nome
  ) {

    const confirmar =
      confirm(
        `Tem certeza que deseja excluir "${nome}"? O histórico de vendas não será apagado.`
      );

    if (!confirmar) {
      return;
    }

    try {

      await deleteDoc(
        doc(
          db,
          "produtos",
          id
        )
      );

      alert(
        "Produto excluído com sucesso!"
      );

      await atualizarTudo();

    } catch (erro) {

      console.error(erro);

      alert(
        "Erro ao excluir o produto."
      );

    }

  }


  /* =====================================================
     MODAL VENDA
     ===================================================== */

  const modalVenda =
    document.getElementById(
      "modal-venda"
    );

  const formVenda =
    document.getElementById(
      "form-venda"
    );

  let produtoVendaAtual =
    null;


  function abrirModalVenda(produto) {

    produtoVendaAtual =
      produto;

    document.getElementById(
      "venda-id"
    ).value =
      produto.id;

    document.getElementById(
      "venda-produto-nome"
    ).textContent =
      `${produto.nome || "Produto"} — ${produto.marca || ""}`;

    document.getElementById(
      "venda-estoque-disponivel"
    ).value =
      numero(produto.estoque);

    document.getElementById(
      "venda-quantidade"
    ).value =
      1;

    document.getElementById(
      "venda-quantidade"
    ).max =
      numero(produto.estoque);

    document.getElementById(
      "venda-preco"
    ).value =
      numero(produto.preco);

    document.getElementById(
      "venda-custo"
    ).value =
      numero(produto.custo);

    document.getElementById("venda-cliente").value = "";
    document.getElementById("venda-telefone").value = "";
    document.getElementById("venda-parcelas").value = "1";
    document.getElementById("venda-primeiro-vencimento").value = dataLocalISO(new Date());

    atualizarResumoVenda();

    modalVenda.style.display =
      "block";

  }


  function atualizarResumoVenda() {

    const quantidade =
      numero(
        document.getElementById(
          "venda-quantidade"
        ).value
      );

    const preco =
      numero(
        document.getElementById(
          "venda-preco"
        ).value
      );

    const custo =
      numero(
        document.getElementById(
          "venda-custo"
        ).value
      );

    const total =
      quantidade * preco;

    const totalCusto =
      quantidade * custo;

    const lucro =
      total - totalCusto;

    document.getElementById(
      "venda-total"
    ).textContent =
      dinheiro(total);

    document.getElementById(
      "venda-total-custo"
    ).textContent =
      dinheiro(totalCusto);

    document.getElementById(
      "venda-lucro"
    ).textContent =
      dinheiro(lucro);

    const parcelas = numero(document.getElementById("venda-parcelas")?.value || 1);
    const valorParcela = parcelas > 0 ? total / parcelas : total;

    const campoValorParcela = document.getElementById("venda-valor-parcela");
    if (campoValorParcela) {
      campoValorParcela.textContent = dinheiro(valorParcela);
    }

    const infoParcelamento = document.getElementById("venda-info-parcelamento");
    if (infoParcelamento) {
      infoParcelamento.textContent = parcelas === 1
        ? "1x: pagamento registrado como pago no momento da venda."
        : `${parcelas}x: as parcelas serão criadas como pendentes para controle no painel de Devedores.`;
    }

  }


  [
    "venda-quantidade",
    "venda-preco",
    "venda-custo",
    "venda-parcelas"
  ].forEach(function(id) {

    document.getElementById(id)
      .addEventListener(
        "input",
        atualizarResumoVenda
      );

  });


  document.getElementById(
    "btn-cancelar-venda"
  ).addEventListener(
    "click",
    function() {

      modalVenda.style.display =
        "none";

    }
  );


  formVenda.addEventListener(
    "submit",
    async function(evento) {

      evento.preventDefault();

      if (!produtoVendaAtual) {
        return;
      }

      const quantidade =
        numero(
          document.getElementById(
            "venda-quantidade"
          ).value
        );

      const preco =
        numero(
          document.getElementById(
            "venda-preco"
          ).value
        );

      const custo =
        numero(
          document.getElementById(
            "venda-custo"
          ).value
        );

      const cliente =
        document.getElementById("venda-cliente").value.trim();

      const telefone =
        document.getElementById("venda-telefone").value.trim();

      const totalParcelas =
        numero(document.getElementById("venda-parcelas").value);

      const primeiroVencimento =
        document.getElementById("venda-primeiro-vencimento").value;

      if (
        !cliente ||
        quantidade <= 0 ||
        preco < 0 ||
        custo < 0 ||
        totalParcelas < 1 ||
        totalParcelas > 5 ||
        !primeiroVencimento
      ) {

        alert(
          "Informe valores válidos."
        );

        return;

      }

      const btn =
        document.getElementById(
          "btn-confirmar-venda"
        );

      btn.disabled =
        true;

      btn.textContent =
        "Registrando...";


      try {

        const produtoRef =
          doc(
            db,
            "produtos",
            produtoVendaAtual.id
          );

        const vendaRef =
          doc(
            collection(
              db,
              "movimentacoes"
            )
          );


        await runTransaction(
          db,
          async function(transaction) {

            const produtoSnap =
              await transaction.get(
                produtoRef
              );

            if (!produtoSnap.exists()) {

              throw new Error(
                "Produto não encontrado."
              );

            }

            const produto =
              produtoSnap.data();

            const estoqueAtual =
              numero(
                produto.estoque
              );

            if (
              quantidade >
              estoqueAtual
            ) {

              throw new Error(
                `Estoque insuficiente. Disponível: ${estoqueAtual}.`
              );

            }

            const novoEstoque =
              estoqueAtual -
              quantidade;

            const totalVenda =
              quantidade *
              preco;

            const totalCusto =
              quantidade *
              custo;

            const lucro =
              totalVenda -
              totalCusto;

            const minimo =
              numero(
                produto.estoqueMinimo ?? 2
              );

            const status =
              novoEstoque <= 0
                ? "Esgotado"
                : novoEstoque <= minimo
                  ? "Estoque baixo"
                  : "Disponível";


            transaction.update(
              produtoRef,
              {
                estoque:
                  novoEstoque,

                status:
                  status
              }
            );


            transaction.set(
              vendaRef,
              {

                tipo:
                  "venda",

                produtoId:
                  produtoVendaAtual.id,

                produtoNome:
                  produto.nome || "",

                marca:
                  produto.marca || "",

                quantidade:
                  quantidade,

                custoUnitario:
                  custo,

                custoTotal:
                  totalCusto,

                precoUnitario:
                  preco,

                totalVenda:
                  totalVenda,

                lucro:
                  lucro,

                cliente:
                  cliente,

                telefone:
                  telefone,

                totalParcelas:
                  totalParcelas,

                primeiroVencimento:
                  primeiroVencimento,

                criadoEm:
                  serverTimestamp()

              }
            );

            const valorParcela =
              totalVenda / totalParcelas;

            const dataBase =
              dataISOParaDate(primeiroVencimento);

            for (let indice = 0; indice < totalParcelas; indice++) {

              const parcelaRef =
                doc(collection(db, "parcelas"));

              const vencimento =
                adicionarMeses(dataBase, indice);

              transaction.set(
                parcelaRef,
                {
                  vendaId: vendaRef.id,
                  produtoId: produtoVendaAtual.id,
                  produtoNome: produto.nome || "",
                  marca: produto.marca || "",
                  cliente: cliente,
                  telefone: telefone,
                  numeroParcela: indice + 1,
                  totalParcelas: totalParcelas,
                  valor: indice === totalParcelas - 1
                    ? totalVenda - (valorParcela * indice)
                    : valorParcela,
                  vencimento: vencimento,
                  status: totalParcelas === 1 ? "Pago" : "Pendente",
                  pagoEm: totalParcelas === 1 ? serverTimestamp() : null,
                  criadoEm: serverTimestamp()
                }
              );

            }

          }
        );


        alert(
          "Venda registrada com sucesso!"
        );

        modalVenda.style.display =
          "none";

        await atualizarTudo();

      } catch (erro) {

        console.error(erro);

        alert(
          erro.message ||
          "Erro ao registrar a venda."
        );

      }


      btn.disabled =
        false;

      btn.textContent =
        "Confirmar venda";

    }
  );


  /* =====================================================
     MODAL ENTRADA
     ===================================================== */

  const modalEntrada =
    document.getElementById(
      "modal-entrada"
    );

  const formEntrada =
    document.getElementById(
      "form-entrada"
    );

  let produtoEntradaAtual =
    null;


  function abrirModalEntrada(produto) {

    produtoEntradaAtual =
      produto;

    document.getElementById(
      "entrada-id"
    ).value =
      produto.id;

    document.getElementById(
      "entrada-produto-nome"
    ).textContent =
      `${produto.nome || "Produto"} — ${produto.marca || ""}`;

    document.getElementById(
      "entrada-quantidade"
    ).value =
      1;

    document.getElementById(
      "entrada-custo"
    ).value =
      numero(produto.custo);

    document.getElementById(
      "entrada-observacao"
    ).value =
      "";

    modalEntrada.style.display =
      "block";

  }


  document.getElementById(
    "btn-cancelar-entrada"
  ).addEventListener(
    "click",
    function() {

      modalEntrada.style.display =
        "none";

    }
  );


  formEntrada.addEventListener(
    "submit",
    async function(evento) {

      evento.preventDefault();

      if (!produtoEntradaAtual) {
        return;
      }

      const quantidade =
        numero(
          document.getElementById(
            "entrada-quantidade"
          ).value
        );

      const custo =
        numero(
          document.getElementById(
            "entrada-custo"
          ).value
        );

      const observacao =
        document.getElementById(
          "entrada-observacao"
        ).value.trim();


      if (
        quantidade <= 0 ||
        custo < 0
      ) {

        alert(
          "Informe valores válidos."
        );

        return;

      }


      try {

        const produtoRef =
          doc(
            db,
            "produtos",
            produtoEntradaAtual.id
          );

        const entradaRef =
          doc(
            collection(
              db,
              "movimentacoes"
            )
          );


        await runTransaction(
          db,
          async function(transaction) {

            const produtoSnap =
              await transaction.get(
                produtoRef
              );

            if (!produtoSnap.exists()) {

              throw new Error(
                "Produto não encontrado."
              );

            }

            const produto =
              produtoSnap.data();

            const estoqueAtual =
              numero(
                produto.estoque
              );

            const novoEstoque =
              estoqueAtual +
              quantidade;

            const minimo =
              numero(
                produto.estoqueMinimo ?? 2
              );

            const status =
              novoEstoque <= 0
                ? "Esgotado"
                : novoEstoque <= minimo
                  ? "Estoque baixo"
                  : "Disponível";


            transaction.update(
              produtoRef,
              {

                estoque:
                  novoEstoque,

                custo:
                  custo,

                status:
                  status

              }
            );


            transaction.set(
              entradaRef,
              {

                tipo:
                  "entrada",

                produtoId:
                  produtoEntradaAtual.id,

                produtoNome:
                  produto.nome || "",

                marca:
                  produto.marca || "",

                quantidade:
                  quantidade,

                custoUnitario:
                  custo,

                custoTotal:
                  quantidade *
                  custo,

                observacao:
                  observacao,

                criadoEm:
                  serverTimestamp()

              }
            );

          }
        );


        alert(
          "Entrada registrada com sucesso!"
        );

        modalEntrada.style.display =
          "none";

        await atualizarTudo();

      } catch (erro) {

        console.error(erro);

        alert(
          erro.message ||
          "Erro ao registrar entrada."
        );

      }

    }
  );


  /* =====================================================
     HISTÓRICO
     ===================================================== */

  let movimentacoesCache =
    [];


  async function buscarMovimentacoes() {

    const consulta =
      await getDocs(
        collection(
          db,
          "movimentacoes"
        )
      );

    movimentacoesCache =
      consulta.docs.map(
        function(documento) {

          return {
            id: documento.id,
            ...documento.data()
          };

        }
      );


    movimentacoesCache.sort(
      function(a, b) {

        const dataA =
          timestampParaData(
            a.criadoEm
          )?.getTime() || 0;

        const dataB =
          timestampParaData(
            b.criadoEm
          )?.getTime() || 0;

        return dataB - dataA;

      }
    );


    return movimentacoesCache;

  }


  async function carregarHistorico() {

    const tabela =
      document.getElementById(
        "tabela-historico"
      );

    tabela.innerHTML =
      `
        <tr>
          <td colspan="7">
            Carregando...
          </td>
        </tr>
      `;

    try {

      const movimentacoes =
        await buscarMovimentacoes();

      if (!movimentacoes.length) {

        tabela.innerHTML =
          `
            <tr>
              <td colspan="7">
                Nenhuma movimentação registrada.
              </td>
            </tr>
          `;

        return;

      }


      tabela.innerHTML =
        "";

      movimentacoes.forEach(
        function(item) {

          const tr =
            document.createElement(
              "tr"
            );

          const venda =
            item.tipo === "venda";

          tr.innerHTML = `

            <td>
              ${escaparHTML(
                formatarData(
                  item.criadoEm
                )
              )}
            </td>

            <td>
              <span class="${
                venda
                  ? "tipo-venda"
                  : "tipo-entrada"
              }">
                ${
                  venda
                    ? "Venda"
                    : "Entrada"
                }
              </span>
            </td>

            <td>
              ${escaparHTML(
                item.produtoNome || ""
              )}
            </td>

            <td>
              ${numero(
                item.quantidade
              )}
            </td>

            <td>
              ${dinheiro(
                item.custoTotal
              )}
            </td>

            <td>
              ${
                venda
                  ? dinheiro(
                      item.totalVenda
                    )
                  : "—"
              }
            </td>

            <td>
              ${
                venda
                  ? dinheiro(
                      item.lucro
                    )
                  : "—"
              }
            </td>

          `;

          tabela.appendChild(
            tr
          );

        }
      );

    } catch (erro) {

      console.error(erro);

      tabela.innerHTML =
        `
          <tr>
            <td colspan="7">
              Erro ao carregar histórico.
            </td>
          </tr>
        `;

    }

  }


  /* =====================================================
     ESTOQUE
     ===================================================== */

  function carregarResumoEstoque() {

    const area =
      document.getElementById(
        "resumo-estoque"
      );

    if (!produtosCache.length) {

      area.innerHTML =
        "<p class='vazio'>Nenhum produto cadastrado.</p>";

      return;

    }


    let totalEstoque =
      0;

    let esgotados =
      0;

    let baixos =
      0;


    produtosCache.forEach(
      function(produto) {

        const quantidade =
          numero(
            produto.estoque
          );

        const minimo =
          numero(
            produto.estoqueMinimo ?? 2
          );

        totalEstoque +=
          quantidade;

        if (quantidade <= 0) {
          esgotados++;
        } else if (
          quantidade <= minimo
        ) {
          baixos++;
        }

      }
    );


    area.innerHTML = `

      <div class="indicadores">

        <div class="indicador">
          <small>Itens em estoque</small>
          <strong>${totalEstoque}</strong>
        </div>

        <div class="indicador">
          <small>Produtos cadastrados</small>
          <strong>${produtosCache.length}</strong>
        </div>

        <div class="indicador">
          <small>Esgotados</small>
          <strong class="negativo">${esgotados}</strong>
        </div>

        <div class="indicador">
          <small>Estoque baixo</small>
          <strong>${baixos}</strong>
        </div>

      </div>

    `;

  }


  /* =====================================================
     DASHBOARD
     ===================================================== */

  const filtroPeriodo =
    document.getElementById(
      "filtro-periodo"
    );


  filtroPeriodo.addEventListener(
    "change",
    function() {

      atualizarDashboard();

    }
  );


  function movimentacaoDentroPeriodo(
    movimentacao,
    inicio
  ) {

    if (!inicio) {
      return true;
    }

    const data =
      timestampParaData(
        movimentacao.criadoEm
      );

    if (!data) {

      /*
        Registros antigos sem timestamp
        entram no "Todo o período",
        mas não são inventados para
        o filtro de 30 dias.
      */
      return false;

    }

    return data >= inicio;

  }


  function atualizarDashboard() {

    const periodo =
      filtroPeriodo.value;

    const inicio =
      dataInicioPeriodo(
        periodo
      );


    const vendas =
      movimentacoesCache.filter(
        function(item) {

          return (
            item.tipo === "venda" &&
            movimentacaoDentroPeriodo(
              item,
              inicio
            )
          );

        }
      );


    const entradas =
      movimentacoesCache.filter(
        function(item) {

          return (
            item.tipo === "entrada" &&
            movimentacaoDentroPeriodo(
              item,
              inicio
            )
          );

        }
      );


    let faturamento =
      0;

    let lucro =
      0;

    let gastos =
      0;

    let unidadesVendidas =
      0;


    const ranking =
      {};


    vendas.forEach(
      function(venda) {

        faturamento +=
          numero(
            venda.totalVenda
          );

        lucro +=
          numero(
            venda.lucro
          );

        unidadesVendidas +=
          numero(
            venda.quantidade
          );


        const nome =
          venda.produtoNome ||
          "Produto removido";


        if (!ranking[nome]) {

          ranking[nome] = {
            nome: nome,
            quantidade: 0,
            faturamento: 0,
            lucro: 0
          };

        }


        ranking[nome].quantidade +=
          numero(
            venda.quantidade
          );

        ranking[nome].faturamento +=
          numero(
            venda.totalVenda
          );

        ranking[nome].lucro +=
          numero(
            venda.lucro
          );

      }
    );


    entradas.forEach(
      function(entrada) {

        gastos +=
          numero(
            entrada.custoTotal
          );

      }
    );


    const ticket =
      vendas.length > 0
        ? faturamento / vendas.length
        : 0;


    document.getElementById(
      "dash-faturamento"
    ).textContent =
      dinheiro(faturamento);

    document.getElementById(
      "dash-lucro"
    ).textContent =
      dinheiro(lucro);

    document.getElementById(
      "dash-gastos"
    ).textContent =
      dinheiro(gastos);

    document.getElementById(
      "dash-vendidos"
    ).textContent =
      unidadesVendidas;

    document.getElementById(
      "dash-produtos"
    ).textContent =
      produtosCache.length;


    const esgotados =
      produtosCache.filter(
        function(produto) {

          return numero(
            produto.estoque
          ) <= 0;

        }
      );


    const baixos =
      produtosCache.filter(
        function(produto) {

          const estoqueAtual =
            numero(
              produto.estoque
            );

          const minimo =
            numero(
              produto.estoqueMinimo ?? 2
            );

          return (
            estoqueAtual > 0 &&
            estoqueAtual <= minimo
          );

        }
      );


    document.getElementById(
      "dash-esgotados"
    ).textContent =
      esgotados.length;

    document.getElementById(
      "dash-baixo"
    ).textContent =
      baixos.length;

    document.getElementById(
      "dash-ticket"
    ).textContent =
      dinheiro(ticket);


    atualizarRanking(
      Object.values(ranking)
    );

    atualizarGrafico(
      Object.values(ranking)
    );

    atualizarListaEsgotados(
      esgotados
    );

    atualizarListaBaixo(
      baixos
    );

  }


  function atualizarRanking(
    ranking
  ) {

    const area =
      document.getElementById(
        "ranking-produtos"
      );

    ranking.sort(
      function(a, b) {

        return b.quantidade -
          a.quantidade;

      }
    );


    const principais =
      ranking.slice(
        0,
        10
      );


    if (!principais.length) {

      area.innerHTML =
        "<p class='vazio'>Nenhuma venda no período.</p>";

      return;

    }


    area.innerHTML =
      "";


    principais.forEach(
      function(item, indice) {

        const div =
          document.createElement(
            "div"
          );

        div.className =
          "ranking-item";

        div.innerHTML = `

          <div>

            <strong>
              ${indice + 1}º —
              ${escaparHTML(item.nome)}
            </strong>

            <span>
              ${item.quantidade} unidade(s)
            </span>

          </div>

          <strong>
            ${dinheiro(item.lucro)}
          </strong>

        `;

        area.appendChild(
          div
        );

      }
    );

  }


  function atualizarGrafico(
    ranking
  ) {

    const area =
      document.getElementById(
        "grafico-faturamento"
      );

    ranking.sort(
      function(a, b) {

        return b.faturamento -
          a.faturamento;

      }
    );


    const dados =
      ranking.slice(
        0,
        8
      );


    if (!dados.length) {

      area.innerHTML =
        "<p class='vazio'>Nenhuma venda no período.</p>";

      return;

    }


    const maior =
      Math.max(
        ...dados.map(
          function(item) {
            return item.faturamento;
          }
        )
      );


    area.innerHTML =
      "";


    dados.forEach(
      function(item) {

        const percentual =
          maior > 0
            ? (
                item.faturamento /
                maior
              ) * 100
            : 0;


        const div =
          document.createElement(
            "div"
          );

        div.className =
          "barra-item";

        div.innerHTML = `

          <div class="barra-nome">
            ${escaparHTML(item.nome)}
          </div>

          <div class="barra-fundo">

            <div
              class="barra"
              style="width:${percentual}%"
            ></div>

          </div>

          <div class="barra-valor">
            ${dinheiro(item.faturamento)}
          </div>

        `;

        area.appendChild(
          div
        );

      }
    );

  }


  function atualizarListaEsgotados(
    produtos
  ) {

    const area =
      document.getElementById(
        "lista-esgotados"
      );


    if (!produtos.length) {

      area.innerHTML =
        "<p class='vazio'>Nenhum produto esgotado.</p>";

      return;

    }


    area.innerHTML =
      "";


    produtos.forEach(
      function(produto) {

        const div =
          document.createElement(
            "div"
          );

        div.className =
          "ranking-item";

        div.innerHTML = `

          <div>

            <strong>
              ${escaparHTML(
                produto.nome || "Sem nome"
              )}
            </strong>

            <span>
              ${escaparHTML(
                produto.marca || ""
              )}
            </span>

          </div>

          <strong class="negativo">
            Esgotado
          </strong>

        `;

        area.appendChild(
          div
        );

      }
    );

  }


  function atualizarListaBaixo(
    produtos
  ) {

    const area =
      document.getElementById(
        "lista-baixo"
      );


    if (!produtos.length) {

      area.innerHTML =
        "<p class='vazio'>Nenhum produto com estoque baixo.</p>";

      return;

    }


    area.innerHTML =
      "";


    produtos.forEach(
      function(produto) {

        const div =
          document.createElement(
            "div"
          );

        div.className =
          "ranking-item";

        div.innerHTML = `

          <div>

            <strong>
              ${escaparHTML(
                produto.nome || "Sem nome"
              )}
            </strong>

            <span>
              Estoque mínimo:
              ${numero(
                produto.estoqueMinimo ?? 2
              )}
            </span>

          </div>

          <strong>
            ${numero(
              produto.estoque
            )} un.
          </strong>

        `;

        area.appendChild(
          div
        );

      }
    );

  }


  /* =====================================================
     ATUALIZAÇÃO GERAL
     ===================================================== */

  async function atualizarTudo() {

    try {

      await buscarProdutos();

      await buscarMovimentacoes();

      await carregarProdutos();

      carregarResumoEstoque();

      await carregarHistorico();

      await carregarDevedores();

      atualizarDashboard();

    } catch (erro) {

      console.error(
        "Erro na atualização geral:",
        erro
      );

    }

  }


  /* =====================================================
     FECHAR MODAIS AO CLICAR FORA
     ===================================================== */

  [
    modalEditar,
    modalVenda,
    modalEntrada
  ].forEach(
    function(modal) {

      modal.addEventListener(
        "click",
        function(evento) {

          if (
            evento.target === modal
          ) {

            modal.style.display =
              "none";

          }

        }
      );

    }
  );
