import { CONTACT, H, LegalPage } from "@/components/legal";

export const metadata = { title: "Términos de uso — El Refugio" };

export default function Terminos() {
  return (
    <LegalPage title="Términos de uso">
      <p>El Refugio es una comunidad para jugar, compartir y participar con el creador y otros miembros. Al crear una cuenta aceptas estos términos.</p>
      <H>1. Cuenta y conducta</H>
      <p>Debes dar un correo válido y verificarlo. Eres responsable de tu cuenta y de mantener tu contraseña en secreto. No se permite el acoso, el spam, las cuentas múltiples para obtener ventajas, las automatizaciones (bots) ni manipular los resultados de los juegos. El equipo puede suspender o cerrar cuentas que incumplan estas normas.</p>
      <H>2. Monedas virtuales, XP e insignias</H>
      <p>Las monedas, la experiencia (XP), las insignias y los elementos de la colección son <strong>exclusivamente virtuales y recreativos</strong>. No se compran con dinero, no se venden, no se transfieren por dinero, no se retiran y no se canjean por productos, tarjetas de regalo ni beneficios económicos. No tienen valor monetario. Pueden cambiar, reiniciarse o retirarse si hay fraude o por razones de seguridad.</p>
      <H>3. Retos entre usuarios</H>
      <p>Los retos solo mueven monedas virtuales entre participantes, según el resultado validado por el servidor. Si un reto ya fue aceptado, las monedas quedan en juego; abandonarlo cuenta como derrota. Un empate devuelve las monedas. El equipo puede desactivar esta función si detecta riesgos de fraude o de cumplimiento.</p>
      <H>4. Donaciones</H>
      <p>Las donaciones son <strong>voluntarias</strong> y están separadas del sistema de juego: no otorgan monedas, XP, insignias, ventajas en los minijuegos ni mejores probabilidades de ganar, y no influyen en los rankings. Un aporte solo se considera confirmado cuando el proveedor de pagos lo confirma al servidor (o el equipo lo registra). Las condiciones de reembolso dependen del proveedor y del equipo; escríbenos si tuviste un problema.</p>
      <H>5. Contenido</H>
      <p>Eres responsable de lo que publicas en tu perfil (nombre, biografía, avatar). No debe ser ilegal, ofensivo ni infringir derechos de terceros. El equipo puede restablecer el contenido que incumpla estas normas.</p>
      <H>6. Disponibilidad y cambios</H>
      <p>La plataforma se ofrece «tal cual». Puede haber interrupciones o cambios en las funciones. Podemos actualizar estos términos; los cambios importantes se avisarán en la plataforma.</p>
      <H>7. Contacto</H>
      <p>Dudas, reportes o solicitudes: {CONTACT}.</p>
    </LegalPage>
  );
}
