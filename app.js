/**
 * Modern Chess Game Review Application
 * With Direct Chess.com User Profile & Games Integration,
 * High-Speed Centipawn Heuristic Review, and Smooth Animated Transitions
 */

const DEFAULT_PGN = `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.10.21"]
[Round "?"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

const SAMPLE_KASPAROV = `[Event "Wijk aan Zee"]
[Site "Wijk aan Zee NED"]
[Date "1999.01.20"]
[White "Garry Kasparov"]
[Black "Veselin Topalov"]
[Result "1-0"]

1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qxd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 1-0`;

// Global State
let chess = new Chess();
let board = null;
let movesData = [];
let currentMoveIdx = -1;
let autoPlayTimer = null;
let isMuted = false;

// Audio synthesis for sounds
const playMoveSound = (isCapture = false) => {
  if (isMuted) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = isCapture ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isCapture ? 320 : 460, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  } catch (e) {
    // Audio context may be restricted before interaction
  }
};

// Material & Positional Evaluation Heuristic
const PIECE_VALS = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
function evaluatePositionFast(fen) {
  const c = new Chess(fen);
  if (c.in_checkmate()) return c.turn() === 'w' ? -10000 : 10000;
  if (c.in_draw() || c.in_threefold_repetition() || c.in_stalemate()) return 0;

  let score = 0;
  const boardArr = c.board();
  for (let r = 0; r < 8; r++) {
    for (let col = 0; col < 8; col++) {
      const piece = boardArr[r][col];
      if (!piece) continue;
      const val = PIECE_VALS[piece.type] || 0;
      score += piece.color === 'w' ? val : -val;
    }
  }
  return score;
}

// Win percentage conversion
function centipawnsToWinPct(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.003682 * cp)) - 1);
}

// Move classification based on Chess.com standards
function classifyMove(winDrop, isSacrifice = false) {
  if (isSacrifice && winDrop < 3) {
    return { name: 'Brilliant', symbol: '!!', color: 'bg-teal-500 text-slate-950' };
  }
  if (winDrop <= 2) {
    return { name: 'Best Move', symbol: '★', color: 'bg-emerald-500 text-slate-950' };
  }
  if (winDrop <= 6) {
    return { name: 'Excellent', symbol: '✓', color: 'bg-lime-500 text-slate-950' };
  }
  if (winDrop <= 12) {
    return { name: 'Good', symbol: '•', color: 'bg-slate-400 text-slate-950' };
  }
  if (winDrop <= 22) {
    return { name: 'Inaccuracy', symbol: '?!', color: 'bg-yellow-500 text-slate-950' };
  }
  if (winDrop <= 40) {
    return { name: 'Mistake', symbol: '?', color: 'bg-orange-500 text-white' };
  }
  return { name: 'Blunder', symbol: '??', color: 'bg-rose-600 text-white' };
}

// Evaluation Bar Update
function updateEvalBar(centipawns) {
  const clamped = Math.max(-1000, Math.min(1000, centipawns));
  const whitePercent = Math.min(95, Math.max(5, 50 + (clamped / 1000) * 50));
  const blackPercent = 100 - whitePercent;

  $('#evalWhiteBar').css('height', `${whitePercent}%`);
  $('#evalBlackBar').css('height', `${blackPercent}%`);

  const displayVal = (Math.abs(centipawns) / 100).toFixed(1);
  if (centipawns >= 0) {
    $('#evalWhiteText').text(`+${displayVal}`);
    $('#evalBlackText').text('');
  } else {
    $('#evalBlackText').text(`-${displayVal}`);
    $('#evalWhiteText').text('');
  }
}

// Main PGN Parser & Review Engine
function reviewPGN(pgnString) {
  const tempChess = new Chess();
  const valid = tempChess.load_pgn(pgnString, { sloppy: true });

  if (!valid) {
    alert('Invalid PGN format! Please check the PGN input.');
    return;
  }

  // Extract Metadata
  const headers = tempChess.header();
  $('#topPlayerName').text(headers.Black || 'Black Player');
  $('#topPlayerRating').text(`(${headers.BlackElo || '1500'})`);
  $('#bottomPlayerName').text(headers.White || 'White Player');
  $('#bottomPlayerRating').text(`(${headers.WhiteElo || '1500'})`);
  $('#summaryWhiteName').text(headers.White || 'White');
  $('#summaryBlackName').text(headers.Black || 'Black');
  $('#gameResultBadge').text(headers.Result || '*');
  $('#gameEventInfo').text(`${headers.Event || 'Game'} • ${headers.Date || 'Recent'}`);

  // Parse moves & evaluate step by step
  const history = tempChess.history({ verbose: true });
  tempChess.reset();

  movesData = [];
  let prevEval = 0;
  let whiteWinDrops = [];
  let blackWinDrops = [];

  history.forEach((m, idx) => {
    const turn = tempChess.turn();
    const prevWin = centipawnsToWinPct(prevEval);

    tempChess.move(m);
    const currFen = tempChess.fen();
    const currEval = evaluatePositionFast(currFen);
    const currWin = centipawnsToWinPct(currEval);

    const winDrop = turn === 'w' ? Math.max(0, prevWin - currWin) : Math.max(0, currWin - prevWin);

    if (turn === 'w') whiteWinDrops.push(winDrop);
    else blackWinDrops.push(winDrop);

    const isPieceSacrifice = m.captured && (m.piece === 'q' || m.piece === 'r');
    const classification = classifyMove(winDrop, isPieceSacrifice);

    movesData.push({
      moveIdx: idx,
      san: m.san,
      from: m.from,
      to: m.to,
      fen: currFen,
      turn: turn,
      evalCp: currEval,
      classification: classification,
      captured: !!m.captured
    });

    prevEval = currEval;
  });

  // Calculate Accuracies
  const calcAcc = (drops) => {
    if (!drops.length) return 92.0;
    const avgLoss = drops.reduce((a, b) => a + b, 0) / drops.length;
    return Math.max(25, Math.min(99.4, 100 - avgLoss * 1.85)).toFixed(1);
  };

  const whiteAccuracy = calcAcc(whiteWinDrops);
  const blackAccuracy = calcAcc(blackWinDrops);

  $('#topPlayerAccuracy').text(`Acc: ${blackAccuracy}%`);
  $('#bottomPlayerAccuracy').text(`Acc: ${whiteAccuracy}%`);
  $('#summaryWhiteAcc').text(`${whiteAccuracy}%`);
  $('#summaryBlackAcc').text(`${blackAccuracy}%`);
  $('#barWhiteAcc').css('width', `${whiteAccuracy}%`);
  $('#barBlackAcc').css('width', `${blackAccuracy}%`);

  renderMoveHistoryTable();
  jumpToMove(-1); // Reset to start
}

// Render Move History Table
function renderMoveHistoryTable() {
  const $list = $('#moveList');
  $list.empty();

  for (let i = 0; i < movesData.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const whiteMove = movesData[i];
    const blackMove = movesData[i + 1] || null;

    const row = $(`
      <div class="move-row grid grid-cols-12 py-1.5 px-2.5 hover:bg-[#302e2b] cursor-pointer items-center transition" data-row="${moveNum}">
        <div class="col-span-2 text-slate-500 font-bold">${moveNum}.</div>
        
        <div class="col-span-5 move-cell flex items-center justify-between pr-2 p-1 rounded hover:bg-[#363430]" data-idx="${i}">
          <span class="text-slate-200 font-semibold">${whiteMove.san}</span>
          <span class="text-[9px] px-1 py-0.2 rounded font-bold ${whiteMove.classification.color}">
            ${whiteMove.classification.symbol}
          </span>
        </div>

        <div class="col-span-5 move-cell flex items-center justify-between pr-2 p-1 rounded ${blackMove ? 'hover:bg-[#363430]' : 'text-transparent'}" data-idx="${blackMove ? i + 1 : -1}">
          ${blackMove ? `
            <span class="text-slate-200 font-semibold">${blackMove.san}</span>
            <span class="text-[9px] px-1 py-0.2 rounded font-bold ${blackMove.classification.color}">
              ${blackMove.classification.symbol}
            </span>
          ` : ''}
        </div>
      </div>
    `);

    $list.append(row);
  }

  $('.move-cell').on('click', function () {
    const idx = parseInt($(this).attr('data-idx'));
    if (!isNaN(idx) && idx >= 0) {
      jumpToMove(idx);
    }
  });
}

// Jump to Move with Smooth Chess.com Animations
function jumpToMove(idx) {
  currentMoveIdx = idx;

  $('#board .square-55d63').removeClass('highlight-from highlight-to');
  $('#badgeOverlay').addClass('hidden');

  if (idx === -1) {
    chess.reset();
    board.position(chess.fen(), true); // Smooth animate back to start
    updateEvalBar(0);
    $('.move-cell').removeClass('active-move');
    $('.move-row').removeClass('active');
    return;
  }

  const item = movesData[idx];
  chess.load(item.fen);
  // Animate piece movement with 'true' parameter
  board.position(item.fen, true);
  playMoveSound(item.captured);
  updateEvalBar(item.evalCp);

  // Chess.com Square Highlight
  $(`#board .square-${item.from}`).addClass('highlight-from');
  $(`#board .square-${item.to}`).addClass('highlight-to');

  // Place classification badge
  const toSquare = $(`#board .square-${item.to}`);
  if (toSquare.length) {
    const offset = toSquare.position();
    const width = toSquare.width();
    $('#badgeOverlay')
      .removeClass('hidden')
      .attr('class', `absolute pointer-events-none transition-all duration-200 font-bold text-xs px-2 py-0.5 rounded-full shadow-2xl z-20 flex items-center gap-1.5 ${item.classification.color}`)
      .html(`<span>${item.classification.symbol}</span> <span>${item.classification.name}</span>`)
      .css({
        top: offset.top - 12,
        left: offset.left + (width / 2) - 30
      });
  }

  // Sync active row in history table
  $('.move-cell').removeClass('active-move');
  $(`.move-cell[data-idx="${idx}"]`).addClass('active-move');

  const rowEl = $(`.move-cell[data-idx="${idx}"]`).closest('.move-row');
  $('.move-row').removeClass('active');
  rowEl.addClass('active');

  const container = document.getElementById('moveList');
  if (rowEl[0] && container) {
    const rowTop = rowEl[0].offsetTop;
    container.scrollTo({ top: rowTop - 100, behavior: 'smooth' });
  }
}

// Chess.com Public API Client
async function fetchChessComGames(username) {
  const cleanUsername = username.trim().toLowerCase();
  if (!cleanUsername) return;

  const $status = $('#chessComStatusMsg');
  const $spinner = $('#fetchBtnSpinner');
  const $list = $('#chessComGamesList');

  $status.removeClass('hidden bg-rose-950/60 border-rose-800 text-rose-300 bg-emerald-950/60 border-emerald-800 text-emerald-300')
         .addClass('bg-slate-900 border-slate-700 text-slate-300')
         .text(`Fetching archives for ${cleanUsername}...`);
  $spinner.removeClass('hidden');
  $list.empty().addClass('hidden');

  try {
    const archiveRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(cleanUsername)}/games/archives`);
    if (!archiveRes.ok) {
      throw new Error(`Chess.com user "${cleanUsername}" not found.`);
    }

    const archiveData = await archiveRes.json();
    const archives = archiveData.archives || [];

    if (archives.length === 0) {
      $status.removeClass('text-slate-300').addClass('bg-yellow-950/60 border-yellow-800 text-yellow-300')
             .text(`No games archive found for ${cleanUsername}.`);
      $spinner.addClass('hidden');
      return;
    }

    // Fetch the most recent archive month
    const latestArchiveUrl = archives[archives.length - 1];
    const gamesRes = await fetch(latestArchiveUrl);
    if (!gamesRes.ok) throw new Error('Failed to fetch recent month games.');

    const gamesData = await gamesRes.json();
    let games = gamesData.games || [];

    // If current month has 0 games, try previous month
    if (games.length === 0 && archives.length > 1) {
      const prevArchiveUrl = archives[archives.length - 2];
      const prevRes = await fetch(prevArchiveUrl);
      if (prevRes.ok) {
        const prevData = await prevRes.json();
        games = prevData.games || [];
      }
    }

    if (games.length === 0) {
      $status.removeClass('text-slate-300').addClass('bg-yellow-950/60 border-yellow-800 text-yellow-300')
             .text(`No games played recently by ${cleanUsername}.`);
      $spinner.addClass('hidden');
      return;
    }

    // Sort most recent first
    games.reverse();

    $status.removeClass('bg-slate-900 border-slate-700 text-slate-300')
           .addClass('bg-emerald-950/60 border-emerald-800 text-emerald-300')
           .text(`Found ${games.length} recent games! Click any game to review.`);

    $list.empty();
    // Render top 25 recent games
    games.slice(0, 25).forEach((g, index) => {
      const isWhite = (g.white.username || '').toLowerCase() === cleanUsername;
      const userObj = isWhite ? g.white : g.black;
      const oppObj = isWhite ? g.black : g.white;

      let resultBadge = '<span class="text-slate-400 font-bold">DRAW</span>';
      if (userObj.result === 'win') {
        resultBadge = '<span class="text-emerald-400 font-bold">WIN</span>';
      } else if (oppObj.result === 'win') {
        resultBadge = '<span class="text-rose-400 font-bold">LOSS</span>';
      }

      const timeClass = g.time_class ? g.time_class.toUpperCase() : 'GAME';
      const dateStr = g.end_time ? new Date(g.end_time * 1000).toLocaleDateString() : '';

      const gameItem = $(`
        <div class="p-3 hover:bg-[#2c2a26] cursor-pointer flex items-center justify-between transition group">
          <div class="flex items-center gap-3">
            <span class="w-2.5 h-2.5 rounded-full ${isWhite ? 'bg-white' : 'bg-slate-950 border border-slate-600'}"></span>
            <div>
              <div class="font-semibold text-xs text-slate-200">
                vs <span class="text-white font-bold">${oppObj.username}</span> 
                <span class="text-slate-500 font-mono">(${oppObj.rating})</span>
              </div>
              <div class="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                <span class="bg-[#302e2b] px-1.5 py-0.2 rounded font-semibold text-slate-300">${timeClass}</span>
                <span>${dateStr}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs font-mono">${resultBadge}</span>
            <button class="bg-[#81b64c] group-hover:bg-[#96c95d] text-white px-3 py-1 rounded-lg text-xs font-bold transition shadow">
              Review
            </button>
          </div>
        </div>
      `);

      gameItem.on('click', () => {
        if (g.pgn) {
          reviewPGN(g.pgn);
          $('#chessComModal').addClass('hidden');
        } else {
          alert('PGN not available for this game.');
        }
      });

      $list.append(gameItem);
    });

    $list.removeClass('hidden');
  } catch (err) {
    $status.removeClass('bg-slate-900 border-slate-700 text-slate-300')
           .addClass('bg-rose-950/60 border-rose-800 text-rose-300')
           .text(err.message || 'Error fetching Chess.com games.');
  } finally {
    $spinner.addClass('hidden');
  }
}

// Initialize Board
function initBoard() {
  const config = {
    draggable: false,
    position: 'start',
    moveSpeed: 240,       // Authentic Chess.com move duration
    snapSpeed: 80,
    snapbackSpeed: 60,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
  };
  board = Chessboard('board', config);
  $(window).resize(() => board.resize());
}

// Document Ready Setup
$(document).ready(() => {
  initBoard();
  reviewPGN(DEFAULT_PGN);

  // Controls
  $('#btnFirst').on('click', () => jumpToMove(-1));
  $('#btnPrev').on('click', () => {
    if (currentMoveIdx > -1) jumpToMove(currentMoveIdx - 1);
  });
  $('#btnNext').on('click', () => {
    if (currentMoveIdx < movesData.length - 1) jumpToMove(currentMoveIdx + 1);
  });
  $('#btnLast').on('click', () => {
    if (movesData.length > 0) jumpToMove(movesData.length - 1);
  });

  $('#btnFlip').on('click', () => board.flip());

  $('#btnSound').on('click', () => {
    isMuted = !isMuted;
    $('#soundIcon').toggleClass('fa-volume-high fa-volume-xmark');
  });

  // Auto-play
  $('#btnAutoPlay').on('click', () => {
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
      $('#playIcon').removeClass('fa-pause').addClass('fa-play');
    } else {
      $('#playIcon').removeClass('fa-play').addClass('fa-pause');
      autoPlayTimer = setInterval(() => {
        if (currentMoveIdx < movesData.length - 1) {
          jumpToMove(currentMoveIdx + 1);
        } else {
          clearInterval(autoPlayTimer);
          autoPlayTimer = null;
          $('#playIcon').removeClass('fa-pause').addClass('fa-play');
        }
      }, 750);
    }
  });

  // Keyboard Navigation
  $(document).keydown((e) => {
    if ($('#pgnModal').is(':visible') || $('#chessComModal').is(':visible')) return;
    if (e.key === 'ArrowLeft') $('#btnPrev').click();
    if (e.key === 'ArrowRight') $('#btnNext').click();
    if (e.key === 'Home') $('#btnFirst').click();
    if (e.key === 'End') $('#btnLast').click();
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      $('#btnAutoPlay').click();
    }
    if (e.key === 'f' || e.key === 'F') $('#btnFlip').click();
  });

  // Chess.com Modal Events
  $('#openChessComModalBtn').on('click', () => $('#chessComModal').removeClass('hidden'));
  $('#closeChessComModalBtn').on('click', () => $('#chessComModal').addClass('hidden'));
  
  $('#fetchChessComGamesBtn').on('click', () => {
    const user = $('#chessComUsernameInput').val();
    fetchChessComGames(user);
  });

  $('#chessComUsernameInput').on('keypress', (e) => {
    if (e.which === 13) {
      fetchChessComGames($('#chessComUsernameInput').val());
    }
  });

  $('.quick-user-btn').on('click', function() {
    const username = $(this).data('username');
    $('#chessComUsernameInput').val(username);
    fetchChessComGames(username);
  });

  // PGN Modal Events
  $('#openPgnModalBtn').on('click', () => $('#pgnModal').removeClass('hidden'));
  $('#closePgnModalBtn, #cancelPgnBtn').on('click', () => $('#pgnModal').addClass('hidden'));
  $('#sampleOperaGame').on('click', () => $('#pgnInput').val(DEFAULT_PGN));
  $('#sampleImmortal').on('click', () => $('#pgnInput').val(SAMPLE_KASPAROV));

  $('#loadPgnBtn').on('click', () => {
    const pgn = $('#pgnInput').val().trim();
    if (!pgn) {
      alert('Please paste a PGN first!');
      return;
    }
    reviewPGN(pgn);
    $('#pgnModal').addClass('hidden');
  });
});
