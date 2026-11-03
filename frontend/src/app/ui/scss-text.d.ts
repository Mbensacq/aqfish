/**
 * Feuille de style lue comme texte (`import x from './_f.scss' with { loader: 'text' }`) :
 * réservé aux tests qui vérifient des valeurs écrites en SCSS (#407, contrastes).
 */
declare module '*.scss' {
  const text: string;
  export default text;
}
