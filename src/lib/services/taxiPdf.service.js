import jsPDF from 'jspdf';

// Helper pour charger le logo
const getBase64ImageFromURL = (url) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.setAttribute("crossOrigin", "anonymous");
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = error => reject(error);
        img.src = url;
    });
};

const formatDate = (d) => new Date(d).toLocaleDateString('fr-BE', { timeZone: 'UTC' });
const formatTime = (d) => new Date(d).toLocaleTimeString('fr-BE', { hour: '2-digit', minute:'2-digit', timeZone: 'UTC' });
const cleanData = (str) => String(str || '').replace(/[\[\]"]/g, '').replace(/,/g, ', ');

export const TaxiPdfService = {
    async generatePDF(data) {
        const doc = new jsPDF();
        
        // Logo
        try {
            const logoData = await getBase64ImageFromURL('/SNCB_logo.png');
            doc.addImage(logoData, 'PNG', 10, 10, 25, 16.33); 
        } catch (e) { console.warn("Logo non trouvé"); }

        doc.setFont("helvetica", "normal");
        
        const drawBox = (x, y, w, h, title = null) => {
            doc.setDrawColor(0);
            doc.setLineWidth(0.3); 
            doc.rect(x, y, w, h);
            if (title) { 
                doc.setFontSize(8); 
                doc.setFont("helvetica", "bold"); 
                doc.text(title, x + 2, y + 5);
            }
        };

        // TITRE
        doc.setFontSize(16); doc.setFont("helvetica", "bold");
        doc.text("BON DE COMMANDE TAXI", 115, 20, { align: "center" });

        // 1. BUREAU EMETTEUR
        const yRow1 = 35; const hRow1 = 45;
        drawBox(10, yRow1, 90, hRow1, "1. Bureau émetteur");
        doc.setFontSize(10); doc.setFont("helvetica", "normal");
        let cY = yRow1 + 12; const lM = 15;
        doc.text(`Rédacteur : ${data.redacteur || ''}`, lM, cY); cY += 6;
        doc.setFont("helvetica", "bold"); doc.text("OCC Mons", lM, cY); cY += 6;
        doc.text("PACO/RCCA", lM, cY); cY += 6; doc.text("7000 Mons", lM, cY);

        // 2. FACTURATION
        drawBox(105, yRow1, 95, hRow1, "2. A facturer à :");
        doc.setFontSize(9); doc.setFont("helvetica", "bold");
        cY = yRow1 + 12; const rM = 110;
        doc.text("SNCB – B-FI.224", rM, cY); cY += 5;
        if (data.is_pmr) doc.text("PO 4523122281 (Voyageurs PMR) (*)", rM, cY);
        else doc.text("PO 4523207823 (Voyageurs/Pers. incident) (*)", rM, cY);
        cY += 6;
        doc.setFont("helvetica", "normal");
        doc.text("10-01 B-FI. 224", rM, cY); cY += 5; doc.text("Rue de France 56", rM, cY); cY += 5;
        doc.text("1060 Bruxelles", rM, cY); cY += 6; doc.setFont("helvetica", "bold");
        doc.text("N° TVA : BE 0203 430 576", rM, cY);

        // 3. SOCIETE
        const yRow2 = yRow1 + hRow1 + 5; const hRow2 = 40;
        drawBox(10, yRow2, 90, hRow2, "3. Société de Taxi :");
        doc.setFontSize(11); doc.setFont("helvetica", "bold");
        doc.text(data.taxi_nom || "Taxi Indépendant", lM, yRow2 + 15);
        doc.setFontSize(10); doc.setFont("helvetica", "normal");
        if(data.taxi_tel) {
            doc.setFontSize(9);
            const tels = cleanData(data.taxi_tel);
            if(tels.length > 30) doc.setFontSize(8);
            doc.text(`Tel: ${tels}`, lM, yRow2 + 22);
        }
        if(data.taxi_email) { 
            doc.setFontSize(8);
            doc.text(cleanData(data.taxi_email), lM, yRow2 + 28); 
        }

        // 4. TRAJET
        const isReturn = data.type_trajet === 'aller-retour';
        const hRowTrajet = isReturn ? 60 : 40; 
        drawBox(105, yRow2, 95, hRowTrajet, "4. Trajet :");
        doc.setFontSize(10); const tX = 110;
        let tY = yRow2 + 12;
        doc.setFont("helvetica", "bold"); doc.text("ALLER :", tX, tY);
        
        const dateStr = `${formatDate(data.date_trajet)} à ${formatTime(data.date_trajet)}`;
        doc.setDrawColor(200, 0, 0); doc.setLineWidth(0.5); doc.rect(tX + 23, tY - 4, 55, 6); 
        doc.setDrawColor(0); doc.setLineWidth(0.3);
        doc.text(dateStr, tX + 25, tY);
        tY += 6;
        
        doc.setFont("helvetica", "bold"); doc.text("De :", tX, tY);
        doc.setFont("helvetica", "normal"); doc.text(data.gare_origine, tX + 15, tY); tY += 5;
        if(data.gare_via) { 
            doc.setFont("helvetica", "bold"); doc.text("Via :", tX, tY); 
            doc.setFont("helvetica", "normal"); doc.text(data.gare_via, tX + 15, tY); tY += 5;
        }
        doc.setFont("helvetica", "bold"); doc.text("Vers :", tX, tY); doc.setFont("helvetica", "normal"); doc.text(data.gare_arrivee, tX + 15, tY);
        
        if (isReturn) {
            tY += 10; 
            doc.setDrawColor(200); doc.line(110, tY - 4, 195, tY - 4); doc.setDrawColor(0);
            doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 150); doc.text("RETOUR :", tX, tY); doc.setTextColor(0);
            doc.setFont("helvetica", "normal");
            const dR = data.date_retour ? formatDate(data.date_retour) : '...';
            const tR = data.date_retour ? formatTime(data.date_retour) : '...';
            doc.text(`${dR} à ${tR}`, tX + 25, tY); tY += 6;
            doc.setFont("helvetica", "bold"); doc.text("De :", tX, tY); doc.setFont("helvetica", "normal");
            doc.text(data.gare_retour_origine || data.gare_arrivee, tX + 15, tY); tY += 5;
            doc.setFont("helvetica", "bold"); doc.text("Vers :", tX, tY); doc.setFont("helvetica", "normal");
            doc.text(data.gare_retour_arrivee || data.gare_origine, tX + 15, tY);
        }

        // 5. DETAILS
        const yRow3 = yRow2 + hRowTrajet + 5;
        const hRow3 = 50; 
        drawBox(10, yRow3, 190, hRow3, "5. Détails & Motif :");
        let pY = yRow3 + 12;
        const pX = 15;
        doc.setFont("helvetica", "bold"); doc.text("Passager(s) :", pX, pY); doc.setFont("helvetica", "normal");
        let paxInfo = data.is_pmr ?
            `${data.pmr_nom} ${data.pmr_prenom} (PMR: ${data.pmr_type})` : (data.passager_nom || "Non nominatif");
        if(data.is_pmr && data.pmr_tel) paxInfo += ` - Tel: ${data.pmr_tel}`;
        doc.text(paxInfo, pX + 30, pY);
        
        let nbPax = `${data.nombre_passagers} pers.`;
        if (data.is_pmr) {
            const nbAccompagnants = data.nombre_passagers - data.nombre_pmr;
            const s = nbAccompagnants > 1 ? 's' : '';
            nbPax += ` (dont ${nbAccompagnants} accompagnant${s})`;
        }
        doc.text(nbPax, 150, pY, { align: "right" });
        pY += 8;
        
        doc.setFont("helvetica", "bold");
        if (data.is_pmr) { 
            doc.text("N° Dossier :", pX, pY); doc.setFont("helvetica", "normal"); doc.text(data.pmr_dossier || 'N/A', pX + 30, pY);
        } else { 
            doc.text("Réf. Relation :", pX, pY); doc.setFont("helvetica", "normal"); doc.text(data.relation_number || 'N/A', pX + 30, pY); 
        }
        pY += 8;
        
        doc.setFont("helvetica", "bold");
        if (data.is_pmr) {
            doc.text("Cause / Remarques :", pX, pY);
            doc.setFont("helvetica", "normal");
            const cause = data.pmr_motif || 'Non spécifiée';
            const remark = data.motif ? ` (Rem: ${data.motif})` : '';
            const splitMotif = doc.splitTextToSize(`${cause}${remark}`, 140); 
            doc.text(splitMotif, pX + 40, pY);
            
            const vehiculeY = pY + (splitMotif.length * 5) + 1;
            doc.setFont("helvetica", "bold");
            doc.text(`Nombre de véhicules : ${data.nombre_vehicules || 1}`, pX, vehiculeY);
        } else {
            doc.text("Motif :", pX, pY);
            doc.setFont("helvetica", "normal");
            const splitMotif = doc.splitTextToSize(data.motif || '', 140); 
            doc.text(splitMotif, pX + 30, pY);
            
            const billingY = pY + (splitMotif.length * 5) + 1; 
            doc.setFont("helvetica", "bold");
            doc.text("À charge de :", pX, billingY);
            doc.setFont("helvetica", "normal");
            doc.text(data.facturation || '-', pX + 30, billingY);
        }

        // FOOTER SIGNATURES
        const yFooter = yRow3 + hRow3 + 45; // Descendu un peu
        doc.setFontSize(8); doc.setFont("helvetica", "italic"); 
        doc.text("Le prestataire certifie l'exécution du transport conformément aux données ci-dessus.", 10, yFooter);
        
        doc.rect(10, yFooter + 2, 90, 20); 
        doc.text("Signature & Cachet Taxi :", 12, yFooter + 6);
        
        doc.rect(110, yFooter + 2, 90, 20); 
        doc.text("Signature Agent SNCB (Si présent) :", 112, yFooter + 6);

        // Nom de fichier
        const dateFile = new Date(data.date_trajet).toLocaleDateString('fr-CA');
        let ref = data.is_pmr ? (data.pmr_dossier || `PMR-${data.id}`) : (data.relation_number || `Ref-${data.id}`);
        const safeName = `Commande-${dateFile}-${data.gare_origine}-${data.gare_arrivee}-${ref}.pdf`.replace(/[^a-z0-9\.\-_]/gi, '_');
        
        doc.save(safeName);
    }
};