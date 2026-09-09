// Carga de librerías oficiales de Firebase Admin SDK y Fetch para hacer la petición a Telegram
const admin = require('firebase-admin');

// Inicializa las credenciales de Firebase usando las variables de entorno de GitHub
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Obtiene el Token del bot y el Chat ID de Telegram almacenados en el sistema
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Función para enviar mensajes formateados a tu Telegram
async function enviarTelegram(mensaje) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: mensaje,
        parse_mode: 'HTML'
      })
    });
    const data = await respuesta.json();
    if (!data.ok) {
      console.error('Error enviando a Telegram:', data);
    } else {
      console.log('Notificación enviada con éxito a Telegram.');
    }
  } catch (error) {
    console.error('Error de red al conectar con Telegram:', error);
  }
}

// Función principal que consulta Firestore y analiza fechas de caducidad
async function revisarCaducidades() {
  console.log('Iniciando revisión diaria de caducidades...');
  
  const snapshot = await db.collection('caducidades').get();
  
  if (snapshot.empty) {
    console.log('No hay registros en la base de datos.');
    return;
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  let alertas = [];

  snapshot.forEach(doc => {
    const datos = doc.data();
    if (!datos.fechaExp) return;

    const partesFecha = datos.fechaExp.split('-');
    const fechaExpira = new Date(partesFecha[0], partesFecha[1] - 1, partesFecha[2]);
    
    const diferenciaTiempo = fechaExpira - hoy;
    const diasRestantes = Math.ceil(diferenciaTiempo / (1000 * 60 * 60 * 24));

    // Si le quedan 5 días o menos (o si ya está vencido)
    if (diasRestantes <= 5) {
      let estadoTexto = '';
      if (diasRestantes < 0) {
        estadoTexto = `❌ <b>VENCIDO</b> hace ${Math.abs(diasRestantes)} día(s)`;
      } else if (diasRestantes === 0) {
        estadoTexto = `🚨 <b>¡VENCE HOY!</b>`;
      } else {
        estadoTexto = `⚠️ Quedan <b>${diasRestantes} día(s)</b>`;
      }

      alertas.push(
        `• <b>${datos.nombre}</b>\n` +
        `  📅 Caduca: ${datos.fechaExp}\n` +
        `  ⏳ Estado: ${estadoTexto}\n` +
        `  👤 Resp: ${datos.responsable || 'Sin asignar'}\n` +
        `  🔄 Tipo: ${datos.tipoRenovacion || 'Manual'}\n`
      );
    }
  });

  // Si se encontraron elementos por vencer, se arma el reporte
  if (alertas.length > 0) {
    const mensajeFinal = `🔔 <b>ALERTA DE CADUCIDADES</b> 🔔\n\n` +
      `Se encontraron los siguientes servicios próximos a vencer:\n\n` +
      alertas.join('\n') +
      `\n<i>Revisa el panel de Domi Alertas. El link para revisión es: https://domi-alertas.web.app/ </i>`;
    
    await enviarTelegram(mensajeFinal);
  } else {
    console.log('No hay ningún registro próximo a vencer en los próximos 5 días.');
  }
}

// Ejecuta la revisión
revisarCaducidades().then(() => process.exit(0)).catch(err => {
  console.error('Error en el script:', err);
  process.exit(1);
});
