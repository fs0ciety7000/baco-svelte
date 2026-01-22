import { toast } from '$lib/stores/toast.js';

/**
 * Helper interne pour convertir une image URL en Base64
 */
function getBase64ImageFromURL(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.setAttribute("crossOrigin", "anonymous");
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const targetWidth = 300;
            const scaleFactor = targetWidth / img.width;
            canvas.width = targetWidth;
            canvas.height = img.height * scaleFactor;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = error => reject(error);
    });
}

export const OttoReportsService = {
    /**
     * Génère un fichier Excel des commandes filtrées
     */
    async generateExcel(commandes) {
        try {
            const XLSX = (await import('xlsx')).default || (await import('xlsx'));
            
            const dataToExport = commandes.map(cmd => ({
                Relation: cmd.relation,
                Type: cmd.is_direct ? 'Direct' : 'Omnibus',
                Société: cmd.societes_bus?.nom || 'Inconnue',
                Statut: cmd.status === 'envoye' ? 'Clôturé' : 'Brouillon',
                Date: new Date(cmd.date_commande).toLocaleDateString('fr-BE'),
                'Heure Appel': cmd.heure_appel || '',
                Origine: cmd.origine || '',
                Destination: cmd.destination || '',
                Motif: cmd.motif || '',
                'Mail Envoyé': cmd.is_mail_sent ? 'Oui' : 'Non',
                Créateur: cmd.creator?.full_name || ''
            }));

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Commandes Otto");
            XLSX.writeFile(workbook, `Export_Otto_${new Date().toISOString().split('T')[0]}.xlsx`);
            toast.success("Fichier Excel généré !");
        } catch (e) {
            console.error(e);
            toast.error("Erreur génération Excel");
        }
    },

    /**
     * Génère une liste simple en PDF
     */
    async generateListPDF(commandes) {
        try {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');

            const doc = new jsPDF('l', 'mm', 'a4');
            doc.setFontSize(16);
            doc.text("Liste des Commandes Bus (Otto)", 15, 15);
            
            const rows = commandes.map(cmd => [
                cmd.relation,
                cmd.is_direct ? 'Direct' : 'Omnibus',
                cmd.societes_bus?.nom || '-',
                cmd.status === 'envoye' ? 'Clôturé' : 'Brouillon',
                new Date(cmd.date_commande).toLocaleDateString('fr-BE'),
                cmd.origine + " -> " + cmd.destination,
                cmd.motif
            ]);

            autoTable(doc, {
                startY: 25,
                head: [['Relation', 'Type', 'Société', 'Statut', 'Date', 'Parcours', 'Motif']],
                body: rows,
                theme: 'grid',
                headStyles: { fillColor: [249, 115, 22] },
                styles: { fontSize: 8 }
            });
            doc.save(`Liste_Otto_${new Date().toISOString().split('T')[0]}.pdf`);
            toast.success("Liste PDF générée !");
        } catch (e) {
            console.error(e);
            toast.error("Erreur génération PDF Liste");
        }
    },

    /**
     * Génère le bon de commande officiel (C3) en PDF
     */
    async generateCommandePDF(form, society, currentUser, chauffeurs = []) {
        try {
            const { jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');

            const doc = new jsPDF();
            const creatorName = form.creator?.full_name || currentUser?.full_name || "Inconnu";

            // Logo
            try {
                const logoData = await getBase64ImageFromURL('/SNCB_logo.png');
                doc.addImage(logoData, 'JPEG', 15, 10, 25, 16.33, 'LogoSNCB', 'FAST');
            } catch (e) { console.warn("Logo non chargé", e); }

            // En-tête Gauche
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text(creatorName, 15, 40);
            doc.setFont("helvetica", "normal");
            doc.text(["SNCB", "Coordinateur Passenger BPT2", "Rue du Musée François Duesberg 1", "7000 Mons", "TEL: +32(0)2 436 0460", "paco.mons@belgiantrain.be"], 15, 45);

            // En-tête Droite (Société)
            const rightX = 195;
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text(society?.nom || "Société Inconnue", rightX, 20, { align: 'right' });
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            let yr = 25;
            if(society?.adresse) {
                const splitAdd = doc.splitTextToSize(society.adresse, 60);
                doc.text(splitAdd, rightX, yr, { align: 'right' });
                yr += (splitAdd.length * 4);
            }
            doc.text(`Tel: ${society?.telephone || '-'}`, rightX, yr, { align: 'right' });
            doc.text(society?.email || '-', rightX, yr + 4, { align: 'right' });

            // Titre
            let y = 75;
            doc.setLineWidth(0.5);
            doc.setDrawColor(0);
            doc.rect(15, y, 180, 20); 
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("Demande service bus de remplacement", 105, y + 7, { align: 'center' });
            doc.setFontSize(11);
            doc.setTextColor(200, 0, 0);
            doc.text("NON planifié / Real Time", 105, y + 12, { align: 'center' });
            doc.setTextColor(0);
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text("Partie A – Service opérationnels SNCB", 105, y + 17, { align: 'center' });

            // Corps du document
            y += 25;
            const infoStartY = y; 
            y += 8;
            const labelX = 20; const valueX = 70;

            doc.setFont("helvetica", "bold"); doc.text("Date de circulation :", labelX, y);
            doc.setFont("helvetica", "normal"); doc.text(new Date(form.date_commande).toLocaleDateString('fr-BE'), valueX, y);
            doc.setFont("helvetica", "bold"); doc.text("Type :", 110, y);
            doc.setFont("helvetica", "normal"); doc.text(form.is_direct ? "DIRECT (Sans arrêt)" : "OMNIBUS (Avec arrêts)", 130, y);

            y += 10;
            doc.setFont("helvetica", "bold"); doc.text("Motif :", labelX, y);
            doc.setFont("helvetica", "normal"); doc.text(form.motif || '', valueX, y);
            y += 8;
            doc.setDrawColor(200); doc.line(20, y-4, 190, y-4); doc.setDrawColor(0);

            doc.setFont("helvetica", "bold"); doc.text("Lieu Origine :", labelX, y);
            doc.setFont("helvetica", "normal"); doc.text(form.origine || '?', valueX, y);
            y += 6;
            
            // Arrêts intermédiaires
            if (!form.is_direct && form.arrets?.length > 0) {
                doc.setFont("helvetica", "bold"); doc.text("Arrêts intermédiaires :", labelX, y);
                doc.setFont("helvetica", "normal"); 
                // Note: On suppose ici que les arrêts sont déjà triés dans form.arrets
                // Si besoin de retrier, la logique doit être passée ou refaite ici
                const arretsSplit = doc.splitTextToSize(form.arrets.join(', '), 120);
                doc.text(arretsSplit, valueX, y);
                y += (arretsSplit.length * 5) + 2;
            }

            doc.setFont("helvetica", "bold"); doc.text("Lieu Destination :", labelX, y);
            doc.setFont("helvetica", "normal"); doc.text(form.destination || '?', valueX, y);
            y += 8;

            doc.setFont("helvetica", "bold"); doc.text("Deux sens :", labelX, y);
            doc.setFont("helvetica", "normal"); doc.text(form.is_aller_retour ? "OUI" : "NON", valueX, y);
            y += 8;

            doc.setFont("helvetica", "bold"); doc.text("Lignes concernées :", labelX, y);
            doc.setFont("helvetica", "normal"); doc.text(form.lignes.join(', ') || '-', valueX, y);
            doc.setFont("helvetica", "bold"); doc.text("Heure d'appel :", 110, y);
            doc.setFont("helvetica", "normal"); doc.text(form.heure_appel || '--:--', 140, y);
            y += 5; 

            doc.rect(15, infoStartY, 180, y - infoStartY);
            y += 10;

            // Tableau des Bus
            const busRows = form.bus_data.map((b, i) => {
                const chauf = chauffeurs.find(c => c.id == b.chauffeur_id);
                const chauffeurStr = chauf ? `\nChauffeur: ${chauf.nom}\nTel: ${chauf.tel}` : ''; 
                const routeStr = b.is_specific_route && (b.origine_specifique || b.destination_specifique)
                    ? `\n[TRAJET]: ${b.origine_specifique || '?'} -> ${b.destination_specifique || '?'}` : '';
                return [`Bus ${i+1}${chauffeurStr}${routeStr}`, b.plaque || '?', b.heure_prevue || '-', b.heure_confirmee || '-', b.heure_demob || '-'];
            });

            autoTable(doc, {
                startY: y,
                head: [['Véhicule / Info', 'Plaque', 'H. Prévue', 'H. Confirmée', 'Démob.']],
                body: busRows,
                theme: 'grid',
                headStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 3, valign: 'middle', lineColor: [0, 0, 0], lineWidth: 0.1 }, 
                margin: { left: 15, right: 15 }, 
                tableWidth: 180,                 
                columnStyles: { 0: { cellWidth: 80 } }
            });
            y = doc.lastAutoTable.finalY + 10;
            if (y > 270) { doc.addPage(); y = 20; }

            doc.setFont("helvetica", "bold"); doc.text("Nombre de voyageurs :", 20, y);
            doc.setFont("helvetica", "normal"); doc.text(String(form.nombre_voyageurs || 'Non communiqué'), 60, y);
            doc.setFont("helvetica", "bold"); doc.text("Dont PMR :", 110, y);
            doc.setFont("helvetica", "normal"); doc.text(String(form.nombre_pmr || '0'), 135, y);

            // Footer légal
            let footerY = Math.max(230, y + 20);
            if (footerY + 45 > doc.internal.pageSize.height - 10) { doc.addPage(); footerY = 20; }

            doc.setDrawColor(0);
            doc.rect(15, footerY, 180, 45);
            doc.setFontSize(10); 
            doc.setFont("helvetica", "bold"); doc.text("Adresse de facturation :", 20, footerY + 6);
            doc.setFont("helvetica", "normal");
            doc.text(["SNCB", "Purchase Accounting B-F.224", "Rue de France 56", "1060 BRUXELLES"], 20, footerY + 12);
            
            const legX = 100;
            doc.setFont("helvetica", "bold"); doc.text("Mentions obligatoires sur la facture :", legX, footerY + 6);
            doc.setFont("helvetica", "normal");
            doc.text(`Numéro de TVA : BE 0203 430 576`, legX, footerY + 12);
            doc.text(`N° SAP de la commande : 4522 944 778`, legX, footerY + 17);
            doc.setFont("helvetica", "bold");
            doc.text(`Numéro de relation : ${form.relation}`, legX, footerY + 25);

            const safe = (str) => (str || '').replace(/[\\/:*?"<>|]/g, '-');
            const fileName = `${form.date_commande} - C3 - ${safe(society?.nom || 'Inconnue')} - ${safe(form.origine)} - ${safe(form.destination)}.pdf`;
            doc.save(fileName);
            toast.success("PDF généré !");
        } catch (e) {
            console.error(e);
            toast.error("Erreur génération PDF Commande");
        }
    }
};