import type { NameRegion } from './nations';
import type { Rng } from '../util/rng';

// Fictional names are built by combining first names and surnames at random.
const FIRST: Record<NameRegion, string[]> = {
  anglo: ['Ollie', 'Harry', 'Jack', 'Tom', 'Sam', 'Ben', 'Callum', 'Will', 'Joe', 'Alfie', 'George', 'Freddie', 'Max', 'Luke', 'Archie', 'Theo', 'Kieran', 'Dan', 'Mitch', 'Lachlan', 'Riley', 'Cooper', 'Hamish', 'Toby'],
  celtic: ['Rhys', 'Owain', 'Gethin', 'Dewi', 'Iestyn', 'Ciaran', 'Cormac', 'Eoin', 'Fionn', 'Ruairi', 'Callum', 'Fraser', 'Ewan', 'Angus', 'Lewis', 'Rory', 'Sean', 'Niall', 'Aled', 'Tadhg', 'Kyle', 'Struan'],
  french: ['Antoine', 'Mathieu', 'Baptiste', 'Romain', 'Thibault', 'Gaël', 'Louis', 'Hugo', 'Maxime', 'Clément', 'Julien', 'Théo', 'Paul', 'Yanis', 'Bastien', 'Rémi', 'Florian', 'Killian', 'Arnaud', 'Loïc'],
  italian: ['Luca', 'Matteo', 'Giovanni', 'Lorenzo', 'Tommaso', 'Federico', 'Alessandro', 'Marco', 'Nicolò', 'Simone', 'Edoardo', 'Davide', 'Andrea', 'Paolo', 'Riccardo', 'Gianluca'],
  pacific: ['Semi', 'Josua', 'Viliami', 'Sione', 'Tevita', 'Isileli', 'Waisea', 'Apisai', 'Ratu', 'Mosese', 'Fetu', 'Tasi', 'Lima', 'Afa', 'Iosefa', 'Pita', 'Siaosi', 'Manu', 'Talo', 'Kini'],
  japanese: ['Haruto', 'Ren', 'Sota', 'Yuto', 'Kenta', 'Daiki', 'Takumi', 'Riku', 'Shota', 'Kaito', 'Hiroki', 'Naoki', 'Yuma', 'Ryota', 'Kosuke', 'Tatsuya'],
  latin: ['Santiago', 'Mateo', 'Tomás', 'Joaquín', 'Facundo', 'Agustín', 'Nicolás', 'Lucas', 'Juan Cruz', 'Ignacio', 'Bautista', 'Franco', 'Gonzalo', 'Martín', 'Felipe', 'Lautaro'],
  afrikaans: ['Pieter', 'Johan', 'Ruan', 'Jaco', 'Werner', 'Sias', 'Thabo', 'Sipho', 'Lwazi', 'Andile', 'Kobus', 'Wian', 'Heinrich', 'Duane', 'Juan', 'Morne', 'Lukhanyo', 'Bongi'],
  maori: ['Tane', 'Rawiri', 'Nikau', 'Wiremu', 'Hemi', 'Kahu', 'Manaia', 'Tama', 'Ari', 'Mason', 'Caleb', 'Blake', 'Jordan', 'Finn', 'Cam', 'Quinn', 'Ethan', 'Reuben'],
};

const LAST: Record<NameRegion, string[]> = {
  anglo: ['Ashworth', 'Pembury', 'Hallow', 'Kingsley', 'Thorne', 'Whitcombe', 'Dalby', 'Fenwick', 'Harrower', 'Mellor', 'Pryor', 'Radcliffe', 'Stanmore', 'Tolley', 'Wexford', 'Calloway', 'Brannock', 'Ellery', 'Gorton', 'Lister', 'Marlow', 'Northcote'],
  celtic: ['ap Rhydian', 'Llewellin', 'Penhallow', 'Treharne', 'Gwynfor', 'MacAuley', 'Dunmore', 'Kilbride', 'Strachan', 'Ardlow', "O'Fearghail", 'Mulcahy', 'Breslin', 'Donnachie', 'Kearns', 'Rafferty', 'MacTavish', 'Glennie', 'Dunleavy', 'Prosser'],
  french: ['Lacombe', 'Dufresne', 'Marchand', 'Bellegarde', 'Rousseau', 'Castagnet', 'Fabre', 'Lavigne', 'Ducasse', 'Peyrac', 'Montaner', 'Sarrat', 'Bérard', 'Garonne', 'Lescure', 'Morvan', 'Tessier', 'Vidalou'],
  italian: ['Bertolini', 'Cavallaro', 'Fontanesi', 'Rinaldi', 'Moretto', 'Zanardi', 'Galletti', 'Benvenuti', 'Ferraro', 'Lombardi', 'Pellegrini', 'Santoro', 'Vianello', 'Damiani', 'Orsolini', 'Trevisan'],
  pacific: ['Naivalu', 'Tuilagi-Vae', 'Ravouvou', 'Matavesi', 'Koroibete-Lua', 'Fifita', 'Vainikolo', 'Taufahema', 'Aumua', 'Leiataua', 'Faleafa', 'Tuimavave', 'Seiuli', 'Nayacalevu', 'Tagicakibau', 'Fonua', 'Halaifonua', 'Masoe'],
  japanese: ['Takeda', 'Morimoto', 'Hayashi', 'Kuroda', 'Fujiwara', 'Nakagawa', 'Ishikawa', 'Ogawa', 'Matsuda', 'Shimizu', 'Yamaguchi', 'Kondo', 'Aoki', 'Sakamoto', 'Hirano', 'Ueda'],
  latin: ['Albarracín', 'Echeverría', 'Montoya', 'Iturralde', 'Benítez', 'Quiroga', 'Saravia', 'Ledesma', 'Villalba', 'Aranguren', 'Cáceres', 'Ortúzar', 'Pereyra', 'Garmendia', 'Bustos', 'Rivadeneira'],
  afrikaans: ['van Rensburg', 'Steenkamp', 'du Toit-Venter', 'Brink', 'Nortje', 'Pretorius', 'Mokoena', 'Ndlovu', 'Dlamini', 'Coetzer', 'Joubert', 'Lombaard', 'Malherbe', 'Visagie', 'Khumalo', 'Swanepoel', 'Botma', 'Mabaso'],
  maori: ['Te Huia', 'Ngata', 'Parata', 'Tawhiri', 'Rangitoa', 'Whaanga', 'Kereama', 'Hapeta', 'Paewai', 'McAllister', 'Fairburn', 'Halloran', 'Strand', 'Wainui', 'Tukaki', 'Harlow'],
};

export function randomName(rng: Rng, region: NameRegion): { first: string; last: string } {
  // A little cross-region mixing reflects modern squads.
  const r = rng.chance(0.15) ? rng.pick(Object.keys(FIRST) as NameRegion[]) : region;
  return { first: rng.pick(FIRST[r]), last: rng.pick(LAST[region]) };
}
