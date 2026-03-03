# Générateur d'isomères d'hydrocarbures (backtracking + 3D)

Application web statique qui:
1. prend une formule brute d'alcane (`CnH2n+2`),
2. génère toutes les structures d'isomères de constitution par **backtracking**,
3. supprime les doublons isomorphes (forme canonique d'arbre),
4. affiche chaque isomère en 3D (Three.js).

## Lancer

```bash
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

## Notes

- Cette version cible les **alcanes acycliques** uniquement.
- La valence du carbone est contrainte à 4.
- Une limite de 9 carbones est appliquée pour garder une exécution interactive.
