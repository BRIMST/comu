import { CONTACT, H, LegalPage } from "@/components/legal";

export const metadata = { title: "Política de privacidad — El Refugio" };

export default function Privacidad() {
  return (
    <LegalPage title="Política de privacidad">
      <p>Esta política explica qué datos personales trata El Refugio, para qué y qué derechos tienes. Responsable del tratamiento: el equipo de El Refugio ({CONTACT}).</p>
      <H>Datos que tratamos</H>
      <ul style={{ paddingLeft: 20 }}>
        <li><strong>Cuenta:</strong> correo electrónico, nombre de usuario, fecha de registro y aceptación de términos.</li>
        <li><strong>Perfil:</strong> nombre visible, avatar, biografía y tus opciones de privacidad.</li>
        <li><strong>Actividad en la plataforma:</strong> partidas, retos, estadísticas, experiencia, insignias, colección, saldo e historial de monedas virtuales, votos en encuestas y notificaciones.</li>
        <li><strong>Donaciones:</strong> monto, estado, fecha y referencia del pago. Los datos de tarjeta o cuenta los procesa el proveedor de pagos; esta web no los recibe ni los guarda.</li>
        <li><strong>Seguridad:</strong> registros de moderación y reportes, contadores para limitar abusos y una huella (hash) de tu dirección IP al registrarte, para frenar la creación masiva de cuentas.</li>
      </ul>
      <H>Para qué los usamos</H>
      <p>Para prestar el servicio (iniciar sesión, jugar, mostrar tu perfil y rankings), proteger la comunidad frente a fraude y abuso, moderar, enviarte las notificaciones que no hayas silenciado y gestionar los aportes voluntarios. No vendemos tus datos ni los usamos para publicidad.</p>
      <H>Qué es público y qué no</H>
      <p>Tu nombre de usuario, avatar y nivel pueden ser públicos. Tú decides si se muestran tus estadísticas, insignias y actividad, y si apareces en los rankings (Perfil → Configuración). Tu correo, saldo, historial de monedas y aportes <strong>nunca</strong> son públicos. El muro de agradecimientos solo muestra lo que tú elijas y nunca el monto.</p>
      <H>Con quién se comparten</H>
      <p>Usamos proveedores que tratan datos por nuestra cuenta: Google Firebase (autenticación y base de datos), Vercel (alojamiento) y, si se activa, Wompi (pagos). Pueden operar fuera de Colombia. Solo accede el equipo autorizado, y cada acción administrativa queda registrada.</p>
      <H>Tus derechos</H>
      <p>Puedes conocer, actualizar, rectificar y suprimir tus datos, y revocar tu autorización (Ley 1581 de 2012 y normas concordantes). Desde <strong>Cuenta</strong> puedes descargar una copia de tus datos y eliminar tu cuenta. También puedes escribirnos a {CONTACT}.</p>
      <H>Qué pasa al eliminar tu cuenta</H>
      <p>Se borran tu perfil, estadísticas, saldo, historial, insignias, colección, notificaciones y tu nombre de usuario queda libre. Se conservan sin identificarte: los retos terminados (con tu nombre sustituido por «usuario eliminado»), los reportes de moderación y los registros contables de donaciones, porque pueden existir obligaciones de conservación. No podrás eliminar la cuenta con retos en curso.</p>
      <H>Conservación y seguridad</H>
      <p>Guardamos los datos mientras tengas cuenta y el tiempo necesario para cumplir obligaciones legales. Aplicamos controles de acceso, validación en el servidor y copias de seguridad. Ningún sistema es infalible: si detectamos un incidente que te afecte, te avisaremos.</p>
      <H>Menores de edad</H>
      <p>Si eres menor de edad, necesitas autorización de tu madre, padre o representante legal para usar la plataforma y no debes hacer donaciones sin su permiso.</p>
    </LegalPage>
  );
}
